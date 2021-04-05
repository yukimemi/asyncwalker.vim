import * as _ from "https://cdn.skypack.dev/lodash@4.17.21";
import { isAbsolute, join } from "https://deno.land/std@0.92.0/path/mod.ts";
import { parse } from "https://deno.land/std@0.92.0/flags/mod.ts";
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
let stop = false;

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
    bufname: string
  ): Promise<[number, number]> => {
    clog({ height, bufname });
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
      setlocal signcolumn=auto
      setlocal winfixheight
    `);
    const winid = (await vim.call("winnr")) as number;
    const bufnr = (await vim.call("bufnr")) as number;
    return await Promise.resolve([winid, bufnr]);
  };

  const update = async (bufnr: number, force: boolean): Promise<void> => {
    clog({ func: "update", bufnr, force });

    const curbuf = (await vim.call("bufnr")) as number;
    if (curbuf !== bufnrFilter) {
      return;
    }

    const input = ((await vim.call(
      "getbufline",
      bufnrFilter,
      1
    )) as string[])[0];
    const re = new RegExp(input, "i");

    if (input === prevInput && !force) {
      return;
    }

    filterEntries = entries.filter((e) => re.test(e));
    clog({ func: "update", input, prevInput });
    console.log(`[${filterEntries.length} / ${entries.length}]`);
    await vim.cmd(`call deletebufline(bufnr, 1, '$')`, { bufnr });
    await vim.cmd(`call setbufline(bufnr, "1", filterEntries)`, {
      bufnr,
      filterEntries,
    });

    prevInput = input;
  };

  const close = async (): Promise<void> => {
    if (bufnrDpswalk !== 0) {
      await vim.execute(`bwipeout! ${bufnrDpswalk}`);
    }
    if (bufnrFilter !== 0) {
      await vim.execute(`bwipeout! ${bufnrFilter}`);
    }
    [winidDpswalk, bufnrDpswalk] = [0, 0];
    [winidFilter, bufnrFilter] = [0, 0];
  };

  await vim.execute(`
    inoremap <plug>(dps-walk-enter) <esc><cmd>call denops#request('${vim.name}', 'dpsEnter', [])<cr>
    nnoremap <plug>(dps-walk-enter) <cmd>call denops#request('${vim.name}', 'dpsEnter', [])<cr>
    nnoremap <plug>(dps-walk-quit) <cmd>call denops#request('${vim.name}', 'dpsQuit', [])<cr>
  `);

  const walkDir = async (args: string[]): Promise<unknown> => {
    clog({ args });
    const cwd = (await vim.call("getcwd")) as string;

    entries = [];
    filterEntries = [];
    stop = false;

    const a = parse(args);
    const pattern =
      a._.length > 0
        ? (a._ as string[])
        : [(await vim.call("input", "Search for pattern: ")) as string];

    let dir = a.path ?? cwd;
    dir = await vim.call("expand", dir);

    if (!isAbsolute(dir)) {
      dir = join(cwd, dir);
    }

    clog({ pattern, dir });

    const prompt = "->";

    await close();

    await vim.autocmd("dpswalk-map", (helper) => {
      helper.remove("*");
      helper.define(
        ["FileType"],
        "dpswalk",
        `call denops#request('${vim.name}', 'setMapWalk', [])`
      );
      helper.define(
        ["FileType"],
        "dpswalk-filter",
        `call denops#request('${vim.name}', 'setMapFilter', [])`
      );
    });

    [winidDpswalk, bufnrDpswalk] = await mkBuf(10, "dpswalk");
    [winidFilter, bufnrFilter] = await mkBuf(1, "dpswalk-filter");
    await vim.execute(`
      resize 1
      call cursor(line('$'), 0)
      startinsert!
    `);

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
    for await (const entry of walk(dir, {
      includeDirs: false,
      match: pattern.map((x) => new RegExp(x, "i")),
      skip,
    })) {
      if (stop) {
        break;
      }
      entries.push(entry.path);
      await update(bufnrDpswalk, true);
    }

    return await Promise.resolve();
  };

  vim.register({
    async run(...args: unknown[]): Promise<unknown> {
      clog({ args });

      return await walkDir(args as string[]);
    },

    async runBufferDir(...args: unknown[]): Promise<unknown> {
      clog({ args });

      const bufname = (await vim.call("bufname")) as string;
      const bufdir = (await vim.call("fnamemodify", bufname, ":h")) as string;
      clog({ bufdir });

      args.push(`--path=${bufdir}`);

      return await walkDir(args as string[]);
    },

    async filterUpdate(...args: unknown[]): Promise<unknown> {
      clog({ func: "filterUpdate", args });

      const bufnr = args[0] as number;
      return await update(bufnr, false);
    },

    async dpsEnter(..._args: unknown[]): Promise<unknown> {
      stop = true;
      const bufnr = (await vim.call("bufnr")) as number;
      if (bufnr === bufnrFilter) {
        await vim.execute(`quit`);
      }

      let line: string;
      while (true) {
        line = (await vim.call("getline", ".")) as string;
        if (line !== "") {
          break;
        }
      }
      clog({ line, bufnrDpswalk });
      await close();
      await vim.execute(`
        edit ${line}
      `);
      return;
    },

    async dpsQuit(..._args: unknown[]): Promise<unknown> {
      stop = true;
      await close();
      return;
    },

    async setMapWalk(..._args: unknown[]): Promise<unknown> {
      const bufname = (await vim.call(`bufname`)) as string;
      clog({ func: "setMapWalk", bufname });
      await vim.execute(`
        imap <silent><buffer> <cr> <plug>(dps-walk-enter)
        nmap <silent><buffer> <cr> <plug>(dps-walk-enter)
        nmap <silent><buffer><nowait> <esc> <plug>(dps-walk-quit)

        nnoremap <silent><buffer><nowait> i <esc><c-w>pA
        nnoremap <silent><buffer><nowait> a <esc><c-w>pA
      `);
      return;
    },
    async setMapFilter(..._args: unknown[]): Promise<unknown> {
      const bufname = (await vim.call(`bufname`)) as string;
      clog({ func: "setMapFilter", bufname });
      await vim.execute(`
        imap <silent><buffer> <cr> <plug>(dps-walk-enter)
        nmap <silent><buffer> <cr> <plug>(dps-walk-enter)

        inoremap <silent><buffer><nowait> <esc> <esc><c-w>p
        inoremap <silent><buffer> <c-j> <esc><c-w>p:call cursor(line('.')+1,0)<cr><c-w>pA
        inoremap <silent><buffer> <c-k> <esc><c-w>p:call cursor(line('.')-1,0)<cr><c-w>pA
      `);
      return;
    },
  });

  await vim.execute(`
    command! -nargs=* DenopsWalk call denops#notify('${vim.name}', 'run', [<f-args>])
    command! -nargs=* DenopsWalkBufferDir call denops#notify('${vim.name}', 'runBufferDir', [<f-args>])
  `);

  clog("dps-walk has loaded");
});
