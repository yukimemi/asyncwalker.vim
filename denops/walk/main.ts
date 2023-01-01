import * as _ from "https://cdn.skypack.dev/lodash@4.17.21";
import * as autocmd from "https://deno.land/x/denops_std@v3.12.1/autocmd/mod.ts";
import * as flags from "https://deno.land/std@0.170.0/flags/mod.ts";
import * as fn from "https://deno.land/x/denops_std@v3.12.1/function/mod.ts";
import * as fs from "https://deno.land/std@0.170.0/fs/mod.ts";
import * as path from "https://deno.land/std@0.170.0/path/mod.ts";
import * as vars from "https://deno.land/x/denops_std@v3.12.1/variable/mod.ts";
import type { Denops } from "https://deno.land/x/denops_std@v3.12.1/mod.ts";
import {
  ensureBoolean,
  ensureNumber,
  ensureString,
} from "https://deno.land/x/unknownutil@v2.1.0/mod.ts";
import { batch } from "https://deno.land/x/denops_std@v3.12.1/batch/mod.ts";
import {
  echo,
  echoerr,
  execute,
  input,
} from "https://deno.land/x/denops_std@v3.12.1/helper/mod.ts";

let entries: string[] = [];
let filterEntries: string[] = [];
let prevInput = "";
let prevWinId = -1;
let bufnrDpswalk = 0;
let bufnrFilter = 0;
let stop = false;
let done = false;

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
    await batch(denops, async (denops) => {
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
    });
    return await fn.bufnr(denops);
  };

  const update = async (force: boolean): Promise<void> => {
    clog({ func: "update", force });

    if (bufnrDpswalk === 0 || bufnrFilter === 0) {
      return;
    }

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
        if (done) {
          await echo(
            denops,
            `[${filterEntries.length} / ${entries.length}] walk end !`,
          );
        } else {
          await echo(denops, `[${filterEntries.length} / ${entries.length}]`);
        }

        if (curbuf === bufnrDpswalk || input === prevInput) {
          // Append only.
          const buf = await fn.getbufline(denops, bufnrDpswalk, 1, "$") || [];
          const rest = _.difference(filterEntries, buf);
          clog({ buf, filterEntries, rest });
          if (buf.length === 0) {
            await fn.setbufline(denops, bufnrDpswalk, "1", rest);
          } else {
            await fn.appendbufline(denops, bufnrDpswalk, "$", rest);
          }
        } else {
          await fn.deletebufline(denops, bufnrDpswalk, 1, "$");
          await fn.setbufline(denops, bufnrDpswalk, "1", filterEntries);
        }
        await denops.cmd("redraw!");
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

  const gotoBufnr = async (bufnr: number): Promise<void> => {
    const id = await fn.bufwinid(denops, bufnr);
    await gotoWinId(id);
  };
  const gotoWinId = async (winId: number): Promise<void> => {
    clog(`goto id: [${winId}]`);
    if (winId !== -1) {
      await fn.win_gotoid(denops, winId);
    }
  };

  const walkDir = async (args: string[]): Promise<void> => {
    clog({ args });
    const cwd = ensureString(await fn.getcwd(denops));

    entries = [];
    filterEntries = [];
    stop = false;
    done = false;

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

    prevWinId = ensureNumber(await fn.win_getid(denops));

    clog({ pattern, dir, prevWinId });

    await batch(denops, async (denops) => {
      await close();
      bufnrDpswalk = await mkBuf(10, "dpswalk");
      await autocmd.group(denops, "dpswalk", (helper) => {
        helper.remove("*", "<buffer>");
        helper.define(
          [
            "CursorHold",
            "CursorHoldI",
          ],
          "<buffer>",
          `call denops#notify('${denops.name}', 'filterUpdate', [v:true])`,
        );
      });

      bufnrFilter = await mkBuf(1, "dpswalk-filter");
      await autocmd.group(denops, "dpswalk-filter", (helper) => {
        helper.remove("*", "<buffer>");
        helper.define(
          [
            "TextChanged",
            "TextChangedI",
            "TextChangedP",
          ],
          "<buffer>",
          `call denops#notify('${denops.name}', 'filterUpdate', [v:false])`,
        );
      });
    });

    if (ensureBoolean(await fn.has(denops, "nvim"))) {
      await batch(denops, async (denops) => {
        await gotoBufnr(bufnrFilter);
        await denops.cmd(`startinsert!`);
      });
    } else {
      await batch(denops, async (denops) => {
        await gotoBufnr(bufnrFilter);
        await denops.cmd(`call feedkeys("a")`);
      });
    }
    await denops.cmd("redraw!");

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
        await update(true);
      }
    }
    clog(`all done`);
    done = true;
    await update(true);
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
      const force = ensureBoolean(args[0]);
      await update(force);
    },

    async dpsEnter(..._args: unknown[]): Promise<void> {
      stop = true;
      await gotoBufnr(bufnrDpswalk);
      const line = ensureString(await fn.getline(denops, "."));
      clog({ line });
      if (existsSync(line)) {
        await gotoWinId(prevWinId);
        await denops.cmd(`e ${line}`);
      } else {
        echoerr(denops, `Not found: [${line}]`);
      }
      await close();
    },

    async dpsQuit(..._args: unknown[]): Promise<void> {
      stop = true;
      await close();
    },

    async setMapWalk(..._args: unknown[]): Promise<void> {
      clog({ func: "setMapWalk" });
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
      const winId = await fn.bufwinid(denops, bufnrDpswalk);
      clog({ func: "setMapFilter", winId });
      await execute(
        denops,
        `
        imap <silent><buffer> <cr> <plug>(dps-walk-enter)
        nmap <silent><buffer> <cr> <plug>(dps-walk-enter)

        inoremap <silent><buffer><nowait> <esc> <esc><c-w>p

        inoremap <buffer> <c-j> <cmd>call win_execute(${winId}, 'call cursor(line(".") % line("$") + 1, 0)')<cr>
        inoremap <buffer> <c-k> <cmd>call win_execute(${winId}, 'call cursor((line(".") - 2 + line("$")) % line("$") + 1, 0)')<cr>
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
