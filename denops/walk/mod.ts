import * as _ from "https://cdn.skypack.dev/lodash@4.17.21";
import { isAbsolute, join } from "https://deno.land/std@0.92.0/path/mod.ts";
import { start } from "https://deno.land/x/denops_std@v0.4/mod.ts";
import { walk } from "https://deno.land/std@0.92.0/fs/mod.ts";

const skip = [
  /\.git/,
  /\.svn/,
  /\.hg/,
  /\.o$/,
  /\.obj$/,
  /\.a$/,
  /\.exe~?$/,
  /tags$/,
  /node_modules/,
  /target\/release/,
  /target\/debug/,
];

let entries: string[] = [];
let filterEntries: string[] = [];
let prevInput = "";
let [winidDpswalk, bufnrDpswalk] = [0, 0];
let [winidFilter, bufnrFilter] = [0, 0];

start(async (vim) => {
  // debug.
  const debug = await vim.g.get("walk_debug", false);
  const clog = (...data: any[]): void => {
    if (debug) {
      console.log(...data);
    }
  };

  const mkBuf = async (
    height: number,
    bufname: string,
    signcolumn = 1
  ): Promise<[number, number]> => {
    await vim.execute(`
      botright ${height}split ${bufname}
      setlocal filetype=${bufname}
      setlocal bufhidden=hide
      setlocal buftype=nofile
      setlocal colorcolumn=
      setlocal foldcolumn=0
      setlocal nobuflisted
      setlocal nofoldenable
      setlocal nolist
      setlocal nomodeline
      setlocal nonumber
      setlocal norelativenumber
      setlocal nospell
      setlocal noswapfile
      setlocal nowrap
      setlocal signcolumn=yes:${signcolumn}
      setlocal winfixheight
    `);
    const winid = (await vim.call("winnr")) as number;
    const bufnr = (await vim.call("bufnr")) as number;
    return await Promise.resolve([winid, bufnr]);
  };

  async function* getFiles(dir: string, pattern: string[]) {
    for await (const entry of walk(dir, {
      includeDirs: false,
      match: pattern.map((p) => new RegExp(p, "i")),
      skip,
    })) {
      entries.push(entry.path);
      yield entry.path;
    }
  }
  const update = async (bufnr: number, force: boolean): Promise<void> => {
    clog({ func: "update", bufnr, force });

    const input = (await vim.call("getline", 1)) as string;
    const re = new RegExp(input, "i");

    if (input === prevInput && !force) {
      return await Promise.resolve();
    }

    filterEntries = entries.filter((e) => re.test(e));
    clog({ func: "update", input, prevInput });
    await vim.cmd(`call deletebufline(bufnr, 1, '$')`, { bufnr });
    await vim.cmd(`call setbufline(bufnr, "1", filterEntries)`, {
      bufnr,
      filterEntries,
    });

    prevInput = input;
    return await Promise.resolve();
  };

  const walkDir = async (pattern: string[], dir: string): Promise<unknown> => {
    clog({ pattern, dir });
    const cwd = (await vim.call("getcwd")) as string;

    entries = [];
    filterEntries = [];

    if (dir === "") {
      if (pattern.length < 2) {
        dir = cwd;
      } else {
        dir = pattern[pattern.length - 1];
        pattern = pattern.slice(0, pattern.length - 1);
      }
    }

    const p =
      pattern.length !== 0
        ? pattern
        : [(await vim.call("input", "Search for pattern: ")) as string];

    if (!isAbsolute(dir)) {
      dir = join(cwd, dir);
    }

    clog({ p, dir });

    const prompt = "->";

    if (bufnrDpswalk !== 0) {
      await vim.execute(`bwipeout! ${bufnrDpswalk}`);
    }
    if (bufnrFilter !== 0) {
      await vim.execute(`bwipeout! ${bufnrFilter}`);
    }

    [winidDpswalk, bufnrDpswalk] = await mkBuf(10, "dpswalk");
    [winidFilter, bufnrFilter] = await mkBuf(
      1,
      "dpswalk-filter",
      prompt.length
    );

    await vim.autocmd("dpswalk", (helper) => {
      helper.remove("*", "<buffer>");
      helper.define(
        ["TextChanged", "TextChangedI", "TextChangedP"],
        "<buffer>",
        `call denops#notify('${vim.name}', 'filterUpdate', [${bufnrDpswalk}])`
      );
    });

    const promptName = "dpswalk_filter_prompt";
    const promptId = 2000;
    await vim.cmd(
      `call sign_define(promptName, {"text": prompt, "texthl": "Error"})`,
      { prompt, promptName }
    );
    await vim.cmd(
      `call sign_unplace("", {"id": promptId, "buffer": bufnrFilter})`,
      { promptId, bufnrFilter }
    );
    await vim.cmd(
      `call sign_place(promptId, "", promptName, bufnrFilter, {"lnum": line('$')})`,
      { promptId, promptName, bufnrFilter }
    );
    await vim.execute(`
      resize 1
      call cursor(line('$'), 0)
      startinsert!
    `);

    const id = setInterval(async () => {
      const input = ((await vim.call(
        "getbufline",
        bufnrFilter,
        1
      )) as string[])[0];
      clog({ func: "setInterval", input, prevInput });
      await update(bufnrDpswalk, true);
    }, 100);

    for await (const entry of walk(dir, {
      includeDirs: false,
      match: p.map((x) => new RegExp(x, "i")),
      skip,
    })) {
      entries.push(entry.path);
      console.log(`[${filterEntries.length} / ${entries.length}]`);
    }

    clearInterval(id);

    return await Promise.resolve();
  };

  vim.register({
    async run(...args: unknown[]): Promise<unknown> {
      clog({ args });

      return await walkDir(args as string[], "");
    },

    async runBufferDir(...args: unknown[]): Promise<unknown> {
      clog({ args });

      const bufname = (await vim.call("bufname")) as string;
      const bufdir = (await vim.call("fnamemodify", bufname, ":h")) as string;
      clog({ bufdir });

      return await walkDir(args as string[], bufdir);
    },

    async filterUpdate(...args: unknown[]): Promise<unknown> {
      clog({ func: "filterUpdate", args });

      const bufnr = args[0] as number;
      return await update(bufnr, false);
    },
  });

  await vim.execute(`
    command! -nargs=* DenopsWalk call denops#notify('${vim.name}', 'run', [<f-args>])
    command! -nargs=* DenopsWalkBufferDir call denops#notify('${vim.name}', 'runBufferDir', [<f-args>])
  `);

  clog("dps-walk has loaded");
});
