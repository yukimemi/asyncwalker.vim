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

start(async (vim) => {
  // debug.
  const debug = await vim.g.get("walk_debug", false);
  const clog = (...data: any[]): void => {
    if (debug) {
      console.log(...data);
    }
  };

  const walkDir = async (pattern: string[], dir: string): Promise<unknown> => {
    clog({ pattern, dir });
    const cwd = (await vim.call("getcwd")) as string;

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

    clog({ p, dir });

    if (!isAbsolute(dir)) {
      dir = join(cwd, dir);
    }

    await vim.call("setqflist", [], "r");
    await vim.call("setqflist", [], "a", {
      title: `[Search files for ${p} on ${dir}]`,
    });
    await vim.execute("botright copen");

    // Async
    for await (const entry of walk(dir, {
      includeDirs: false,
      match: [new RegExp(p.join(" "))],
      skip,
    })) {
      clog(entry.path);
      await vim.call("setqflist", [], "a", {
        lines: [entry.path],
        efm: "%f",
      });
    }

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
  });

  await vim.execute(`
    command! -nargs=* DenopsWalk call denops#notify('${vim.name}', 'run', [<f-args>])
    command! -nargs=* DenopsWalkBufferDir call denops#notify('${vim.name}', 'runBufferDir', [<f-args>])
  `);

  clog("dps-walk has loaded");
});
