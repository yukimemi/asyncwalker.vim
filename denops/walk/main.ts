import * as _ from "https://cdn.skypack.dev/lodash@4.17.21";
import * as autocmd from "https://deno.land/x/denops_std@v5.2.0/autocmd/mod.ts";
import * as flags from "https://deno.land/std@0.209.0/flags/mod.ts";
import * as fn from "https://deno.land/x/denops_std@v5.2.0/function/mod.ts";
import * as fs from "https://deno.land/std@0.209.0/fs/mod.ts";
import * as path from "https://deno.land/std@0.209.0/path/mod.ts";
import * as vars from "https://deno.land/x/denops_std@v5.2.0/variable/mod.ts";
import * as buffer from "https://deno.land/x/denops_std@v5.2.0/buffer/mod.ts";
import type { Denops } from "https://deno.land/x/denops_std@v5.2.0/mod.ts";
import { ensure, is } from "https://deno.land/x/unknownutil@v3.11.0/mod.ts";
import { batch } from "https://deno.land/x/denops_std@v5.2.0/batch/mod.ts";
import { echo, echoerr, execute, input } from "https://deno.land/x/denops_std@v5.2.0/helper/mod.ts";
import { send } from "https://deno.land/x/denops_std@v5.2.0/helper/keymap.ts";

let entries: string[] = [];
let filterEntries: string[] = [];
let prevInput = "";
let prevWinId = -1;
let bufnrWalk = 0;
let bufnrFilter = 0;
let stop = false;
let done = false;
let noMapping = false;

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
  const height = await vars.g.get(denops, "walk_height", 15);
  const chunk = await vars.g.get(denops, "walk_chunk", 500);
  const ignore = await vars.g.get(denops, "walk_ignore", [
    "\\.git",
    "\\.svn",
    "\\.hg",
    "\\.o$",
    "\\.obj$",
    "\\.a$",
    "\\.exe~?$",
    "tags$",
  ]);
  noMapping = await vars.g.get(denops, "walk_no_mapping", noMapping);

  // deno-lint-ignore no-explicit-any
  const clog = (...data: any[]): void => {
    if (debug) {
      console.log(...data);
    }
  };

  clog({ debug, height, chunk, ignore });

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

    if (bufnrWalk === 0 || bufnrFilter === 0) {
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

        if (curbuf === bufnrWalk || input === prevInput) {
          // Append only.
          const buf = await fn.getbufline(denops, bufnrWalk, 1, "$") || [];
          const rest = _.difference(filterEntries, buf);
          clog({ buf, filterEntries, rest });
          if (buf.length === 0) {
            await fn.setbufline(denops, bufnrWalk, 1, rest);
          } else {
            await fn.appendbufline(denops, bufnrWalk, "$", rest);
          }
        } else {
          await fn.deletebufline(denops, bufnrWalk, 1, "$");
          await fn.setbufline(denops, bufnrWalk, 1, filterEntries);
        }
        await denops.cmd("redraw!");
      });
      prevInput = input;
    } catch (e) {
      clog(e);
    }
  };

  const close = async (): Promise<void> => {
    if (bufnrWalk !== 0) {
      await denops.cmd(`bwipeout! ${bufnrWalk}`);
    }
    if (bufnrFilter !== 0) {
      await denops.cmd(`bwipeout! ${bufnrFilter}`);
    }
    bufnrWalk = 0;
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
    const cwd = ensure(await fn.getcwd(denops), is.String);

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

    prevWinId = ensure(await fn.win_getid(denops), is.Number);

    clog({ pattern, dir, prevWinId });

    await batch(denops, async (denops) => {
      await close();
      bufnrWalk = await mkBuf(height, "dpswalk");
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

    await gotoBufnr(bufnrFilter);
    await send(denops, "a");
    await denops.cmd("redraw!");

    let cnt = 0;
    for await (
      const entry of fs.walk(dir, {
        includeDirs: false,
        match: pattern.map((x) => new RegExp(x, "i")),
        skip: ignore.map((x) => new RegExp(x, "i")),
      })
    ) {
      if (stop) {
        break;
      }
      entries.push(entry.path);
      cnt++;
      if (cnt % chunk === 0) {
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
      const force = ensure(args[0], is.Boolean);
      await update(force);
    },

    async dpsEnter(..._args: unknown[]): Promise<void> {
      stop = true;
      await gotoBufnr(bufnrWalk);
      const line = ensure(await fn.getline(denops, "."), is.String);
      clog({ line });
      if (existsSync(line)) {
        await gotoWinId(prevWinId);
        await buffer.open(denops, line);
      } else {
        echoerr(denops, `Not found: [${line}]`);
      }
      await close();
    },

    async dpsQuit(..._args: unknown[]): Promise<void> {
      stop = true;
      await close();
    },

    async dpsInsert(..._args: unknown[]): Promise<void> {
      await gotoBufnr(bufnrFilter);
      await denops.cmd("startinsert!");
    },

    async dpsEscape(..._args: unknown[]): Promise<void> {
      await gotoBufnr(bufnrWalk);
      await denops.cmd("stopinsert!");
    },

    async dpsCursor(...args: unknown[]): Promise<void> {
      const direction = ensure(args[0], is.Boolean);
      const winId = await fn.bufwinid(denops, bufnrWalk);
      if (direction) {
        await fn.win_execute(denops, winId, `call cursor(line(".") % line("$") + 1, 0)`, true);
      } else {
        await fn.win_execute(
          denops,
          winId,
          `call cursor((line(".") - 2 + line("$")) % line("$") + 1, 0)`,
          true,
        );
      }
    },

    async setMapWalk(..._args: unknown[]): Promise<void> {
      clog({ func: "setMapWalk" });
      if (noMapping) {
        return;
      }
      await execute(
        denops,
        `
          imap <silent><buffer> <cr> <plug>(dps-walk-enter)
          nmap <silent><buffer> <cr> <plug>(dps-walk-enter)
          nmap <silent><buffer><nowait> <esc> <plug>(dps-walk-quit)

          nnoremap <silent><buffer><nowait> i <plug>(dps-walk-insert)
          nnoremap <silent><buffer><nowait> a <plug>(dps-walk-insert)
      `,
      );
    },
    async setMapFilter(..._args: unknown[]): Promise<void> {
      const winId = await fn.bufwinid(denops, bufnrWalk);
      clog({ func: "setMapFilter", winId });
      if (noMapping) {
        return;
      }
      await execute(
        denops,
        `
          imap <silent><buffer> <cr> <plug>(dps-walk-enter)
          nmap <silent><buffer> <cr> <plug>(dps-walk-enter)

          inoremap <silent><buffer><nowait> <esc> <plug>(dps-walk-escape)

          inoremap <buffer> <c-j> <plug>(dps-walk-cursor-down)
          inoremap <buffer> <c-k> <plug>(dps-walk-cursor-up)
        `,
      );
    },
  };

  await execute(
    denops,
    `
      inoremap <plug>(dps-walk-enter) <esc><cmd>call denops#request('${denops.name}', 'dpsEnter', [])<cr>
      nnoremap <plug>(dps-walk-enter) <cmd>call denops#request('${denops.name}', 'dpsEnter', [])<cr>

      inoremap <plug>(dps-walk-quit) <cmd>call denops#request('${denops.name}', 'dpsQuit', [])<cr>
      nnoremap <plug>(dps-walk-quit) <cmd>call denops#request('${denops.name}', 'dpsQuit', [])<cr>

      inoremap <plug>(dps-walk-insert) <cmd>call denops#request('${denops.name}', 'dpsInsert', [])<cr>
      nnoremap <plug>(dps-walk-insert) <cmd>call denops#request('${denops.name}', 'dpsInsert', [])<cr>

      inoremap <plug>(dps-walk-escape) <cmd>call denops#request('${denops.name}', 'dpsEscape', [])<cr>
      nnoremap <plug>(dps-walk-escape) <cmd>call denops#request('${denops.name}', 'dpsEscape', [])<cr>

      inoremap <plug>(dps-walk-cursor-up) <cmd>call denops#request('${denops.name}', 'dpsCursor', [v:false])<cr>
      inoremap <plug>(dps-walk-cursor-down) <cmd>call denops#request('${denops.name}', 'dpsCursor', [v:true])<cr>

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
