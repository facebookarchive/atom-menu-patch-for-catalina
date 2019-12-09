# Atom menu patch for macOS Catalina

To work around https://github.com/atom/atom/issues/20034, replace atom's context menus with an HTML/CSS version so that electron menus are never invoked.

## Installing

You can install this from within Atom, via the normal package installation process ("install" menu under settings).

## How it works

This package monkey-patches part of `atom.contextMenu` to not use `electron.remote.Menu` and instead create an HTML/CSS menu via the `context-menu` library.

This is only a workaround to the real problem, which lies within electron. Once electron gets upgraded, atom should be able to update to fix this. As of atom `0.41.0`, this is not yet fixed.
HTML context menus have some downsides, such as being unable to go outside the window and looking different from native context menus. This package vaguely styles the menus similarly to native.
This only gets applied on darwin and for versions `19.0.0` (macOS 10.15 Catalina) and above.

## Building

This is written in plain javascript so there is no build process required. To test changes, just use `apm link .` from the root folder to have atom symlink it into `~/.atom/packages` so that it gets loaded the next time you reload atom.

## Contributing

See the [CONTRIBUTING](CONTRIBUTING.md) file for how to help out.

## License

This project is MIT licensed, as found in the LICENSE file.
