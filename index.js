/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

const ContextMenu = require('context-menu').default;
const os = require('os');
const fs = require('fs');
const ReactDOM = require('react-dom');

function arraySplit(
  array,
  shouldSplitPredicate,
) {
  const result = [];
  let current = [];
  for (const value of array) {
    if (shouldSplitPredicate(value)) {
      result.push(current);
      current = [];
    } else {
      current.push(value);
    }
  }
  if (current.length > 0) {
    result.push(current);
  }
  return result;
}

function getTextForAccelerator(accelerator) {
  if (accelerator == null) {
    return undefined;
  }
  return accelerator
    .replace(/Command\+/g, '\u2318')
    .replace(/Shift\+/g, '\u21e7')
    .replace(/Alt\+/g, '\u2325')
    .replace(/Ctrl\+/g, '\u2303')
    .replace('BACKSPACE', '\u232B')
    .replace('SPACE', '\u2423')
    .replace('TAB', '\u21E5')
    .replace('DELETE', '\u232B')
    .replace('UP', '\u2191')
    .replace('DOWN', '\u2193')
    .replace('LEFT', '\u2190')
    .replace('RIGHT', '\u2192');
}

function convertElectronMenu(
  event,
  template,
) {
  return arraySplit(
    template.filter(item => item.visible !== false),
    item => item.type === 'separator',
  ).map(
    (subarray) =>
      subarray.map(
        (item) => {
          if (item.submenu != null) {
            return {
              label: item.label,
              submenu: convertElectronMenu(event, item.submenu),
              disabled: false,
            };
          }
          return {
            label: item.label,
            sublabel: getTextForAccelerator(item.accelerator),
            onClick: () => {
              if (item.command != null) {
                atom.commands.dispatch(event.target, item.command);
              }
            },
            disabled: item.enabled === false,
          };
        },
      ),
  );
}

/**
 * After opening the context menu, the context-menu library
 * sets up a window click handler to detect when you've clicked
 * on an item or clicked outside to close the menu, or right clicked
 * again to open a new menu. The problem is that atom (or some other mysterious force)
 * does a `stopPropagation` _somewhere_, causing the `onClick` of a menu item to not
 * trigger hiding the menu correctly. This means that subsequent context menu item clicks
 * would have their click event stolen by this handler, causing the menu to do nothing.
 * Even destorying the entire contet-menu library doesn't fix this, because their click handler
 * is not correctly disposed. Instead, we can force emit a click just before showing the menu
 * to make sure the click handler registers the click. This should be harmless, but it is
 * a little sketchy to dispatch this event to window.
 */
function dispatchFakeWindowMouseDown() {
  const event = document.createEvent('MouseEvents');
  event.initMouseEvent(
    'mousedown',
    true, // bubbles
    true, // cancelable
    document.defaultView,
    0, // button
    0, // pointerX
    0, // pointerY
    0, // pointerX
    0, // pointerY
    false, // ctrlKey
    false, // altKey
    false, // shiftKey
    false, // metaKey
    0, // button
    window,
  );
  window.dispatchEvent(event);
}

/**
* atom on macOS Catalina can crash when showing a context menu.
* To prevent this, we can just stop atom from using `electron.remote.Menu` and instead
* make our own HTML-based context menus.
*/
async function monkeyPatchContextMenus() {
  // Catalina is darwin version 19.0.0; also take 20, 21, etc for future-proofing
  // https://en.wikipedia.org/wiki/Darwin_%28operating_system%29#Release_history
  const isCatalinaOrLater = process.platform === 'darwin' && /^19\.|^2\d\./.test(os.release());
  if (!isCatalinaOrLater) {
    return;
  }

  // Import default styles from the context-menu package, since we're not using css-in-js
  const stylesPath = require.resolve('context-menu/lib/styles.css');
  const contextMenuDefaultStyles = await new Promise(
    (res, rej) => fs.readFile(stylesPath, 'utf-8', (err, data) => err ? rej(err) : res(data))
  );
  const styles = document.createElement('style');
  // Style the menu to be similar to macOS context menu styling
  styles.innerHTML = `
    ${contextMenuDefaultStyles}
    .context-menu {
      background-color: rgb(160,160,160);
      border-radius: 6px;
      box-shadow: rgba(0,0,0,0.5) 2px 2px 10px;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      color: black;
      padding: 4px 0;
      z-index: 12;
    }
    .context-menu ul:not(:first-child) {
      border-top: 2px solid rgb(145,148,153);
    }
    .context-menu ul {
      padding: 2px 0;
    }
    .context-menu li {
      padding-left: 18px;
    }
    .context-menu button {
      white-space: nowrap;
    }
    .context-menu li:hover {
      background-color: rgb(39, 94, 194);
      color: white;
    }
    .context-menu button i.submenu-expand {
      padding-right: 8px;
    }
    .context-menu button i.submenu-expand:after {
      content: '\\25ba';
    }
    .context-menu button span.label.sublabel {
      font-size: 100%;
    }
  `;
  document.head.appendChild(styles);

  const installContextMenus = () => {
    const contextMenuRoot = document.createElement('div');
    ContextMenu.init(contextMenuRoot, {theme: 'custom'});
    document.body.appendChild(contextMenuRoot);
    return () => {
      const children = Array.from(contextMenuRoot.children);
      children.forEach(child => {
        ReactDOM.unmountComponentAtNode(child);
      });
      contextMenuRoot.remove();
    };
  }

  const disposeContextMenu = installContextMenus();

  const savedShowForEvent = atom.contextMenu.showForEvent;
  atom.contextMenu.showForEvent = function(event) {
    // Based on atom's default implementation:
    // https://raw.githubusercontent.com/atom/atom/master/src/context-menu-manager.coffee
    this.activeElement = event.target;
    const menuTemplate = this.templateForEvent(event);
    if (menuTemplate == null || menuTemplate.length === 0) {
      return;
    }

    const groups = convertElectronMenu(event, menuTemplate);
    dispatchFakeWindowMouseDown();
    ContextMenu.showMenu(groups);
  };

  return () => {
    // cleanup
    atom.contextMenu.showForEvent = savedShowForEvent;
    disposeContextMenu();
    styles.remove();
  };
}

let dispose;
module.exports = {
  activate() {
    setImmediate(() => {
      dispose = monkeyPatchContextMenus();
    });
  },
  deactivate() {
    if (dispose != null) {
      dispose();
    }
  },
};
