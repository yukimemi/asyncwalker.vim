// =============================================================================
// File        : main.ts
// Author      : yukimemi
// Last Change : 2024/11/02 21:57:45.
// =============================================================================

import * as autocmd from "jsr:@denops/std@7.6.0/autocmd";
import * as buffer from "jsr:@denops/std@7.6.0/buffer";
import * as fn from "jsr:@denops/std@7.6.0/function";
import * as fs from "jsr:@std/fs@1.0.19";
import * as path from "jsr:@std/path@1.1.1";
import * as vars from "jsr:@denops/std@7.6.0/variable";
import type { Denops } from "jsr:@denops/std@7.6.0";
import { batch } from "jsr:@denops/std@7.6.0/batch";
import { difference } from "jsr:@es-toolkit/es-toolkit@1.39.7";
import { echo, echoerr, execute, input } from "jsr:@denops/std@7.6.0/helper";
import { parseArgs } from "jsr:@std/cli@1.0.21";
import { z } from "npm:zod@4.0.8";

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
  const debug = await vars.g.get(denops, "asyncwalker_debug", false);
  const height = await vars.g.get(denops, "asyncwalker_height", 15);
  const chunk = await vars.g.get(denops, "asyncwalker_chunk", 500);
  const ignore = await vars.g.get(denops, "asyncwalker_ignore", [
    "\\.git",
    "\\.svn",
    "\\.hg",
    "\\.o$",
    "\\.obj$",
    "\\.a$",
    "\\.exe~?$",
    "tags$",
  ]);
  noMapping = await vars.g.get(denops, "asyncwalker_no_mapping", noMapping);

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
          const rest = difference(filterEntries, buf);
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

  const walkDir = async (args: string[], resume = false): Promise<void> => {
    clog({ args });
    const cwd = z.string().parse(await fn.getcwd(denops));

    if (!resume) {
      entries = [];
      filterEntries = [];
      prevInput = "";
    }
    stop = false;
    done = false;

    const a = parseArgs(args);
    let pattern = a._.length > 0 ? (a._ as string[]) : [];
    if (pattern.length == 0 && !resume) {
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

    prevWinId = z.number().parse(await fn.win_getid(denops));

    clog({ pattern, dir, prevWinId });

    await batch(denops, async (denops) => {
      await close();
      bufnrWalk = await mkBuf(height, "asyncwalker");
      await autocmd.group(denops, "asyncwalker", (helper) => {
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

      bufnrFilter = await mkBuf(1, "asyncwalker-filter");
      await autocmd.group(denops, "asyncwalker-filter", (helper) => {
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
      if (resume) {
        await fn.setbufline(denops, bufnrFilter, 1, prevInput);
      }
    });

    await gotoBufnr(bufnrWalk);
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

  const resume = async (): Promise<void> => {
    await walkDir([], true);
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

    async resume(): Promise<void> {
      await resume();
    },

    async runBufferDir(...args: unknown[]): Promise<void> {
      clog({ args });

      const bufname = await fn.bufname(denops);
      const bufdir = await fn.fnamemodify(denops, bufname, ":p:h");
      clog({ bufdir });

      args.push(`--path=${bufdir}`);

      await walkDir(args as string[]);
    },

    async filterUpdate(...args: unknown[]): Promise<void> {
      clog({ func: "filterUpdate", args });
      const force = z.boolean().parse(args[0]);
      await update(force);
    },

    async asyncwalkerEnter(..._args: unknown[]): Promise<void> {
      stop = true;
      await gotoBufnr(bufnrWalk);
      const line = z.string().parse(await fn.getline(denops, "."));
      clog({ line });
      if (existsSync(line)) {
        await gotoWinId(prevWinId);
        await buffer.open(denops, line);
      } else {
        echoerr(denops, `Not found: [${line}]`);
      }
      await close();
    },

    async asyncwalkerQuit(..._args: unknown[]): Promise<void> {
      stop = true;
      await close();
    },

    async asyncwalkerInsert(..._args: unknown[]): Promise<void> {
      await gotoBufnr(bufnrFilter);
      await denops.cmd("startinsert!");
    },

    async asyncwalkerEscape(..._args: unknown[]): Promise<void> {
      await gotoBufnr(bufnrWalk);
      await denops.cmd("stopinsert!");
    },

    async asyncwalkerCursor(...args: unknown[]): Promise<void> {
      const direction = z.boolean().parse(args[0]);
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
          imap <silent><buffer> <cr> <Plug>(asyncwalker-enter)
          nmap <silent><buffer> <cr> <Plug>(asyncwalker-enter)
          nmap <silent><buffer><nowait> <esc> <Plug>(asyncwalker-quit)

          nnoremap <silent><buffer><nowait> i <Plug>(asyncwalker-insert)
          nnoremap <silent><buffer><nowait> a <Plug>(asyncwalker-insert)
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
          imap <silent><buffer> <cr> <Plug>(asyncwalker-enter)
          nmap <silent><buffer> <cr> <Plug>(asyncwalker-enter)

          inoremap <silent><buffer><nowait> <esc> <Plug>(asyncwalker-escape)

          inoremap <buffer> <c-j> <Plug>(asyncwalker-cursor-down)
          inoremap <buffer> <c-k> <Plug>(asyncwalker-cursor-up)
        `,
      );
    },
  };

  await execute(
    denops,
    `
      inoremap <Plug>(asyncwalker-enter) <esc><cmd>call denops#request('${denops.name}', 'asyncwalkerEnter', [])<cr>
      nnoremap <Plug>(asyncwalker-enter) <cmd>call denops#request('${denops.name}', 'asyncwalkerEnter', [])<cr>

      inoremap <Plug>(asyncwalker-quit) <cmd>call denops#request('${denops.name}', 'asyncwalkerQuit', [])<cr>
      nnoremap <Plug>(asyncwalker-quit) <cmd>call denops#request('${denops.name}', 'asyncwalkerQuit', [])<cr>

      inoremap <Plug>(asyncwalker-insert) <cmd>call denops#request('${denops.name}', 'asyncwalkerInsert', [])<cr>
      nnoremap <Plug>(asyncwalker-insert) <cmd>call denops#request('${denops.name}', 'asyncwalkerInsert', [])<cr>

      inoremap <Plug>(asyncwalker-escape) <cmd>call denops#request('${denops.name}', 'asyncwalkerEscape', [])<cr>
      nnoremap <Plug>(asyncwalker-escape) <cmd>call denops#request('${denops.name}', 'asyncwalkerEscape', [])<cr>

      inoremap <Plug>(asyncwalker-cursor-up) <cmd>call denops#request('${denops.name}', 'asyncwalkerCursor', [v:false])<cr>
      inoremap <Plug>(asyncwalker-cursor-down) <cmd>call denops#request('${denops.name}', 'asyncwalkerCursor', [v:true])<cr>
    `,
  );
  await autocmd.group(denops, "asyncwalker-map", (helper) => {
    helper.remove("*");
    helper.define(
      "FileType",
      "asyncwalker",
      `call denops#request('${denops.name}', 'setMapWalk', [])`,
    );
    helper.define(
      "FileType",
      "asyncwalker-filter",
      `call denops#request('${denops.name}', 'setMapFilter', [])`,
    );
  });

  clog("asyncwalker.vim has loaded");
}
