// Maps uiohook-napi keycodes (used for recording) to nut.js Key enum values (used for
// replay) and back to a display name (used to humanize a macro for the approval review).
const { UiohookKey } = require('uiohook-napi');
const { Key } = require('@nut-tree-fork/nut-js');

const codeToNameMap = {};
for (const [name, code] of Object.entries(UiohookKey)) {
  codeToNameMap[code] = name;
}

const NAME_TO_NUT = {
  Backspace: Key.Backspace,
  Tab: Key.Tab,
  Enter: Key.Return,
  CapsLock: Key.CapsLock,
  Escape: Key.Escape,
  Space: Key.Space,
  PageUp: Key.PageUp,
  PageDown: Key.PageDown,
  End: Key.End,
  Home: Key.Home,
  ArrowLeft: Key.Left,
  ArrowUp: Key.Up,
  ArrowRight: Key.Right,
  ArrowDown: Key.Down,
  Insert: Key.Insert,
  Delete: Key.Delete,
  NumpadMultiply: Key.Multiply,
  NumpadAdd: Key.Add,
  NumpadSubtract: Key.Subtract,
  NumpadDecimal: Key.Decimal,
  NumpadDivide: Key.Divide,
  NumpadEnter: Key.Enter,
  Semicolon: Key.Semicolon,
  Equal: Key.Equal,
  Comma: Key.Comma,
  Minus: Key.Minus,
  Period: Key.Period,
  Slash: Key.Slash,
  Backquote: Key.Grave,
  BracketLeft: Key.LeftBracket,
  Backslash: Key.Backslash,
  BracketRight: Key.RightBracket,
  Quote: Key.Quote,
  Ctrl: Key.LeftControl,
  CtrlRight: Key.RightControl,
  Alt: Key.LeftAlt,
  AltRight: Key.RightAlt,
  Shift: Key.LeftShift,
  ShiftRight: Key.RightShift,
  Meta: Key.LeftSuper,
  MetaRight: Key.RightSuper,
  NumLock: Key.NumLock,
  ScrollLock: Key.ScrollLock,
  PrintScreen: Key.Print,
};
for (let i = 0; i <= 9; i++) NAME_TO_NUT[String(i)] = Key['Num' + i];
for (const l of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') NAME_TO_NUT[l] = Key[l];
for (let i = 1; i <= 24; i++) NAME_TO_NUT['F' + i] = Key['F' + i];
for (let i = 0; i <= 9; i++) NAME_TO_NUT['Numpad' + i] = Key['NumPad' + i];

function codeToName(code) {
  return codeToNameMap[code] || null;
}

function uiohookCodeToNutKey(code) {
  const name = codeToNameMap[code];
  if (!name) return null;
  const nutKey = NAME_TO_NUT[name];
  return nutKey === undefined ? null : nutKey;
}

module.exports = { uiohookCodeToNutKey, codeToName };
