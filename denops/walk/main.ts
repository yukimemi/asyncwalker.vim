import * as _ from "https://cdn.skypack.dev/lodash@4.17.21";
import * as autocmd from "https://deno.land/x/denops_std@v3.3.2/autocmd/mod.ts";
import * as flags from "https://deno.land/std@0.145.0/flags/mod.ts";
import * as fn from "https://deno.land/x/denops_std@v3.3.2/function/mod.ts";
import * as fs from "https://deno.land/std@0.145.0/fs/mod.ts";
import * as path from "https://deno.land/std@0.145.0/path/mod.ts";
import * as vars from "https://deno.land/x/denops_std@v3.3.2/variable/mod.ts";
import type { Denops } from "https://deno.land/x/denops_std@v3.3.2/mod.ts";
import {
  ensureBoolean,
  ensureNumber,
  ensureString,
} from "https://deno.land/x/unknownutil@v2.0.0/mod.ts";
import { batch } from "https://deno.land/x/denops_std@v3.3.2/batch/mod.ts";
import {
  echo,
  echoerr,
  execute,
  input,
} from "https://deno.land/x/denops_std@v3.3.2/helper/mod.ts";

let entries: string[] = [];
let filterEntries: string[] = [];
let prevInput = "";
let bufnrDpswalk = 0;
let bufnrFilter = 0;
let stop = false;

export function existsSync(filePath: string): boolean {
  try {
    Deno.lstatSync(filePath);
    return true;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return false;
    }
    throw err;
  }
}

export async function main(denops: Denops): Promise<void> {
  // debug.
  const debug = await vars.g.get(denops, "walk_debug", false);
  // deno-lint-ignore no-explicit-any
  const clog = (...data: any[]): void => {
    if (debug) {
      console.log(...data);
    }
  };
  const bufsize = ensureNumber(await vars.g.get(denops, "walk_bufsize", 500));
  const skips = (await vars.g.get(denops, "walk_skips", [
    "\\.git",
    "\\.svn",
    "\\.hg",
    "\\.o$",
    "\\.obj$",
    "\\.a$",
    "\\.exe~?$",
    "tags$",
  ])) as string[];

  clog({ debug, bufsize, skips });

  const mkBuf = async (height: number, bufname: string): Promise<number> => {
    clog({ height, bufname });
    await execute(
      denops,
      `
      botright ${height}new ${bufname}
      setlocal filetype=${bufname}
      setlocal bufhidden=hide
      setlocal buftype=nofile
      setlocal colorcolumn=
      setlocal concealcursor=inv
      setlocal conceallevel=3
      setlocal cursorline
      setlocal foldcolumn=0
      setlocal nobuflisted
      setlocal nocursorcolumn
      setlocal nofoldenable
      setlocal nolist
      setlocal nomodeline
      setlocal nonumber
      setlocal norelativenumber
      setlocal nospell
      setlocal noswapfile
      setlocal nowrap
      setlocal signcolumn=yes
      setlocal winfixheight
    `,
    );
    return await fn.bufnr(denops);
  };

  const update = async (bufnr: number, force: boolean): Promise<void> => {
    clog({ func: "update", bufnr, force });

    const curbuf = await fn.bufnr(denops);
    const input = (await fn.getbufline(denops, bufnrFilter, 1))[0];
    clog({ func: "update", input, prevInput });

    if (input === prevInput && !force) {
      return;
    }

    try {
      const re = new RegExp(input, "i");
      filterEntries = entries.filter((e) => re.test(e));

      await batch(denops, async (denops) => {
        await echo(denops, `[${filterEntries.length} / ${entries.length}]`);

        if (curbuf === bufnrDpswalk || input === prevInput) {
          // Append only.
          const buf = await fn.getline(denops, 1, "$");
          const rest = _.difference(buf, filterEntries);
          await fn.appendbufline(denops, bufnrDpswalk, "$", rest);
        } else {
          await fn.deletebufline(denops, bufnr, 1, "$");
          await fn.setbufline(denops, bufnr, "1", filterEntries);
        }

        await denops.cmd("redraw");
      });
      prevInput = input;
    } catch (e) {
      clog(e);
    }
  };

  const close = async (): Promise<void> => {
    if (bufnrDpswalk !== 0) {
      await denops.cmd(`bwipeout! ${bufnrDpswalk}`);
    }
    if (bufnrFilter !== 0) {
      await denops.cmd(`bwipeout! ${bufnrFilter}`);
    }
    bufnrDpswalk = 0;
    bufnrFilter = 0;
  };

  const goto = async (bufnr: number): Promise<void> => {
    const id = await fn.bufwinid(denops, bufnr);
    clog({ id });
    if (id !== -1) {
      await fn.win_gotoid(denops, id);
    }
  };

  const walkDir = async (args: string[]): Promise<void> => {
    clog({ args });
    const cwd = ensureString(await fn.getcwd(denops));

    entries = [];
    filterEntries = [];
    stop = false;

    const a = flags.parse(args);
    let pattern = a._.length > 0 ? (a._ as string[]) : [];
    if (pattern.length == 0) {
      const userInput = await input(denops, { prompt: "Search for pattern: " });
      if (userInput == null) {
        clog(`input is null ! so cancel !`);
        return;
      }
      pattern = [userInput];
    }

    let dir = a.path ?? cwd;
    dir = await fn.expand(denops, dir);

    if (!path.isAbsolute(dir)) {
      dir = path.join(cwd, dir);
    }

    clog({ pattern, dir });

    const prompt = ">";

    await close();

    await batch(denops, async (denops) => {
      bufnrDpswalk = await mkBuf(10, "dpswalk");
      bufnrFilter = await mkBuf(1, "dpswalk-filter");

      const promptName = "dpswalk_filter_prompt";
      const promptId = 2000;
      await denops.cmd(
        `call sign_define(promptName, {"text": prompt})`,
        { prompt, promptName },
      );
      await denops.cmd(
        `call sign_unplace("", {"id": promptId, "buffer": bufnrFilter})`,
        { promptId, bufnrFilter },
      );
      await denops.cmd(
        `call sign_place(promptId, "", promptName, bufnrFilter, {"lnum": line('$')})`,
        {
          promptId,
          promptName,
          bufnrFilter,
        },
      );
      await autocmd.group(denops, "dpswalk", (helper) => {
        helper.remove("*", "<buffer>");
        helper.define(
          ["TextChanged", "TextChangedI", "TextChangedP"],
          "<buffer>",
          `call denops#notify('${denops.name}', 'filterUpdate', [${bufnrDpswalk}])`,
        );
      });
      await denops.cmd("redraw!");
    });

    await goto(bufnrFilter);
    if (ensureBoolean(await fn.has(denops, "nvim"))) {
      await denops.cmd(`startinsert!`);
    } else {
      await denops.cmd(`call feedkeys("a")`);
    }

    let cnt = 0;
    for await (
      const entry of fs.walk(dir, {
        includeDirs: false,
        match: pattern.map((x) => new RegExp(x, "i")),
        skip: skips.map((x) => new RegExp(x, "i")),
      })
    ) {
      if (stop) {
        break;
      }
      entries.push(entry.path);
      cnt++;
      if (cnt % bufsize === 0) {
        await update(bufnrDpswalk, true);
      }
    }
    await update(bufnrDpswalk, true);
  };

  denops.dispatcher = {
    async run(...args: unknown[]): Promise<void> {
      try {
        clog({ args });
        await walkDir(args as string[]);
      } catch (e) {
        clog(e);
      }
    },

    async runBufferDir(...args: unknown[]): Promise<void> {
      clog({ args });

      const bufname = await fn.bufname(denops);
      const bufdir = await fn.fnamemodify(denops, bufname, ":h");
      clog({ bufdir });

      args.push(`--path=${bufdir}`);

      await walkDir(args as string[]);
    },

    async filterUpdate(...args: unknown[]): Promise<void> {
      clog({ func: "filterUpdate", args });
      const bufnr = ensureNumber(args[0]);
      await update(bufnr, false);
    },

    async dpsEnter(..._args: unknown[]): Promise<void> {
      stop = true;

      await goto(bufnrDpswalk);
      const line = ensureString(await fn.getline(denops, "."));
      clog({ line });
      await close();
      if (existsSync(line)) {
        await denops.cmd(`edit ${line}`);
      } else {
        echoerr(denops, `Not found: [${line}]`);
      }
    },

    async dpsQuit(..._args: unknown[]): Promise<void> {
      stop = true;
      await close();
    },

    async setMapWalk(..._args: unknown[]): Promise<void> {
      const bufname = await fn.bufname(denops);
      clog({ func: "setMapWalk", bufname });
      await execute(
        denops,
        `
        imap <silent><buffer> <cr> <plug>(dps-walk-enter)
        nmap <silent><buffer> <cr> <plug>(dps-walk-enter)
        nmap <silent><buffer><nowait> <esc> <plug>(dps-walk-quit)

        nnoremap <silent><buffer><nowait> i <esc><c-w>pA
        nnoremap <silent><buffer><nowait> a <esc><c-w>pA
      `,
      );
    },
    async setMapFilter(..._args: unknown[]): Promise<void> {
      const bufname = await fn.bufname(denops);
      clog({ func: "setMapFilter", bufname });
      await execute(
        denops,
        `
        imap <silent><buffer> <cr> <plug>(dps-walk-enter)
        nmap <silent><buffer> <cr> <plug>(dps-walk-enter)

        inoremap <silent><buffer><nowait> <esc> <esc><c-w>p
        inoremap <silent><buffer> <c-j> <esc><c-w>p:call cursor(line('.')+1,0)<cr><c-w>pA
        inoremap <silent><buffer> <c-k> <esc><c-w>p:call cursor(line('.')-1,0)<cr><c-w>pA
      `,
      );
    },
  };

  await execute(
    denops,
    `
    inoremap <plug>(dps-walk-enter) <esc><cmd>call denops#request('${denops.name}', 'dpsEnter', [])<cr>
    nnoremap <plug>(dps-walk-enter) <cmd>call denops#request('${denops.name}', 'dpsEnter', [])<cr>
    nnoremap <plug>(dps-walk-quit) <cmd>call denops#request('${denops.name}', 'dpsQuit', [])<cr>

    command! -nargs=* DenopsWalk call denops#notify('${denops.name}', 'run', [<f-args>])
    command! -nargs=* DenopsWalkBufferDir call denops#notify('${denops.name}', 'runBufferDir', [<f-args>])
  `,
  );
  await autocmd.group(denops, "dpswalk-map", (helper) => {
    helper.remove("*");
    helper.define(
      "FileType",
      "dpswalk",
      `call denops#request('${denops.name}', 'setMapWalk', [])`,
    );
    helper.define(
      "FileType",
      "dpswalk-filter",
      `call denops#request('${denops.name}', 'setMapFilter', [])`,
    );
  });

  clog("dps-walk has loaded");
}
