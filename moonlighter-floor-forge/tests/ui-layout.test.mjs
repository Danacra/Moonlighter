import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const editor=readFileSync(new URL("../scripts/room-editor.mjs",import.meta.url),"utf8");
const css=readFileSync(new URL("../styles/main.css",import.meta.url),"utf8");
for(const id of ["mff-room-kind","mff-door-width","mff-door-width-out","mff-snap-walls","mff-auto-perimeter",
  "mff-door-inspector","mff-selected-side","mff-selected-offset","mff-selected-width",
  "mff-annotation-svg","mff-editor-status"]){
 assert.ok(editor.includes('id="'+id+'"'),"Missing editor control "+id);
}
assert.ok(editor.includes('<section class="mff-editor-toolbar"'));
assert.ok(editor.includes('</section>\n    <div class="mff-editor-canvas"'),"Canvas must not be inside the controls panel");
assert.ok(editor.includes('class="mff-door-range-row"'),"Door width has a dedicated range row");
assert.ok(editor.includes('class="mff-inspector-grid"'),"Door settings use a responsive grid");
assert.ok(editor.includes('class="mff-wall-options"'),"Wall switches use a separate layout");
assert.ok(css.includes("position: static !important"),"Toolbar must not be sticky over the image");
assert.ok(css.includes("overflow-y: auto"),"Long editor window must scroll");
for(const selector of [".mff-door-range-row",".mff-inspector-grid",".mff-wall-options",
  ".mff-editor-section",".mff-editor-canvas","@media (max-width: 520px)"]){
 assert.ok(css.includes(selector),"Missing responsive rule "+selector);
}
assert.ok(!css.includes("position:sticky;top:0;z-index:10"),"Obsolete sticky toolbar rule returned");
console.log("PASS: room editor controls, independent canvas and responsive layout safeguards");
