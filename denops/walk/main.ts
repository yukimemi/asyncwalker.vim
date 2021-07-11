import {
  _,
  autocmd,
  Denops,
  execute,
  flags,
  fn,
  fs,
  path,
  vars,
} from "./deps.ts";

let entries: string[] = [];
let filterEntries: string[] = [];
let prevInput = "";
let bufnrDpswalk = 0;
let bufnrFilter = 0;
let stop = false;

export async function main(denops: Denops): Promise<void> {
  // debug.
  const debug = await vars.g.get(denops, "walk_debug", false);
  const clog = (...data: any[]): void => {
    if (debug) {
      console.log(...data);
    }
  };
  const bufsize = (await vars.g.get(denops, "walk_bufsize", 500)) as number;
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

  clog({ debug });
  clog({ bufsize });
  clog({ skips });

  const mkBuf = async (
    height: number,
    bufname: string,
  ): Promise<number> => {
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
    const bufnr = (await denops.call("bufnr")) as number;
    return await Promise.resolve(bufnr);
  };

  const update = async (bufnr: number, force: boolean): Promise<void> => {
    clog({ func: "update", bufnr, force });

    const curbuf = (await denops.call("bufnr")) as number;
    if (curbuf !== bufnrFilter) {
      return;
    }

    clog({ func: "update", curbuf });
    const input = (await fn.getbufline(denops, bufnrFilter, 1))[0];
    clog({ func: "update", input, prevInput });

    if (input === prevInput && !force) {
      return;
    }

    const re = new RegExp(input, "i");
    filterEntries = entries.filter((e) => re.test(e));
    console.log(`[${filterEntries.length} / ${entries.length}]`);
    await fn.deletebufline(denops, bufnr, 1, "$");
    await fn.setbufline(denops, bufnr, "1", filterEntries);
    prevInput = input;
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

  await execute(
    denops,
    `
    inoremap <plug>(dps-walk-enter) <esc><cmd>call denops#request('${denops.name}', 'dpsEnter', [])<cr>
    nnoremap <plug>(dps-walk-enter) <cmd>call denops#request('${denops.name}', 'dpsEnter', [])<cr>
    nnoremap <plug>(dps-walk-quit) <cmd>call denops#request('${denops.name}', 'dpsQuit', [])<cr>
  `,
  );

  const walkDir = async (args: string[]): Promise<void> => {
    clog({ args });
    const cwd = (await denops.call("getcwd")) as string;

    entries = [];
    filterEntries = [];
    stop = false;

    const a = flags.parse(args);
    const pattern = a._.length > 0
      ? (a._ as string[])
      : [(await fn.input(denops, "Search for pattern: ")) as string];

    let dir = a.path ?? cwd;
    dir = await fn.expand(denops, dir);

    if (!path.isAbsolute(dir)) {
      dir = path.join(cwd, dir);
    }

    clog({ pattern, dir });

    const prompt = ">";

    await close();

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

    bufnrDpswalk = await mkBuf(10, "dpswalk");
    await denops.cmd(`silent doautocmd FileType dpswalk`);

    bufnrFilter = await mkBuf(1, "dpswalk-filter");
    await execute(
      denops,
      `
      silent doautocmd FileType dpswalk-filter
      resize 1
      call cursor(line('$'), 0)
    `,
    );
    if ((await fn.has(denops, "nvim")) as boolean) {
      await denops.cmd(`startinsert!`);
    } else {
      await denops.cmd(`call feedkeys("a")`);
    }

    await autocmd.group(denops, "dpswalk", (helper) => {
      helper.remove("*", "<buffer>");
      helper.define(
        ["TextChanged", "TextChangedI", "TextChangedP"],
        "<buffer>",
        `call denops#notify('${denops.name}', 'filterUpdate', [${bufnrDpswalk}])`,
      );
    });

    const promptName = "dpswalk_filter_prompt";
    const promptId = 2000;
    await denops.cmd(
      `call sign_define(promptName, {"text": prompt, "texthl": "Error"})`,
      { prompt, promptName },
    );
    await denops.cmd(
      `call sign_unplace("", {"id": promptId, "buffer": bufnrFilter})`,
      { promptId, bufnrFilter },
    );
    await denops.cmd(
      `call sign_place(promptId, "", promptName, bufnrFilter, {"lnum": line('$')})`,
      { promptId, promptName, bufnrFilter },
    );

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
    // deno-lint-ignore require-await
    async run(...args: unknown[]): Promise<void> {
      try {
        (async () => {
          try {
            clog({ args });
            await walkDir(args as string[]);
          } catch (e) {
            clog(e);
          }
        })();
      } catch (e) {
        clog(e);
      }
    },

    async runBufferDir(...args: unknown[]): Promise<void> {
      clog({ args });

      const bufname = (await fn.bufname(denops)) as string;
      const bufdir = (await fn.fnamemodify(denops, bufname, ":h")) as string;
      clog({ bufdir });

      args.push(`--path=${bufdir}`);

      await walkDir(args as string[]);
    },

    async filterUpdate(...args: unknown[]): Promise<void> {
      clog({ func: "filterUpdate", args });

      const bufnr = args[0] as number;
      await update(bufnr, false);
    },

    async dpsEnter(..._args: unknown[]): Promise<void> {
      stop = true;
      const bufnr = (await denops.call("bufnr")) as number;
      if (bufnr === bufnrFilter) {
        await denops.cmd(`quit`);
      }

      let line: string;
      while (true) {
        line = (await fn.getline(denops, ".")) as string;
        if (line !== "") {
          break;
        }
      }
      clog({ line, bufnrDpswalk });
      await close();
      await denops.cmd(`edit ${line}`);
    },

    async dpsQuit(..._args: unknown[]): Promise<void> {
      stop = true;
      await close();
    },

    async setMapWalk(..._args: unknown[]): Promise<void> {
      const bufname = (await denops.call(`bufname`)) as string;
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
      const bufname = (await denops.call(`bufname`)) as string;
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
    command! -nargs=* DenopsWalk call denops#notify('${denops.name}', 'run', [<f-args>])
    command! -nargs=* DenopsWalkBufferDir call denops#notify('${denops.name}', 'runBufferDir', [<f-args>])
  `,
  );

  clog("dps-walk has loaded");
}
