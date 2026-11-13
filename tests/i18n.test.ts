import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { load } from "cheerio";
// @ts-expect-error UI module is plain browser JavaScript.
import { messages } from "../ui/i18n.js";
it("provides both languages for every visible static label",()=>{
  const $=load(readFileSync(new URL('../ui/index.html',import.meta.url),'utf8'));
  for(const attr of ['data-i18n','data-placeholder','data-aria'])$(`[${attr}]`).each((_,el)=>{
    const key=$(el).attr(attr)!;
    expect(messages.en[key],key+' en').toBeTypeOf('string');expect(messages.tr[key],key+' tr').toBeTypeOf('string');
  });
  expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.tr).sort());
  expect(Object.keys(messages.en.errors).sort()).toEqual(Object.keys(messages.tr.errors).sort());
});
