import { test, expect } from "@playwright/test";
import { chooseRhythmNote } from "../src/rhythmTiming";
const notes = [
  { at: 1000, lane: 0 },
  { at: 1220, lane: 2 },
];
test("tecla correta encontra sua pista mesmo com nota perdida em outra pista", () => {
  // The previous note is 20 ms closer, but belongs to another lane.
  expect(chooseRhythmNote(notes, 0, 1250, 0, 2, new Set())?.i).toBe(1);
});
test("notas julgadas e requisições em voo não são escolhidas novamente", () => {
  expect(chooseRhythmNote(notes, 0, 1370, 0, 2, new Set([1]))?.i).toBe(0);
  expect(
    chooseRhythmNote(notes, 0, 1370, 0, 2, new Set([0, 1])),
  ).toBeUndefined();
});
test("tecla errada continua indo ao servidor e janelas não são ampliadas", () => {
  expect(chooseRhythmNote(notes, 0, 1150, 0, 3, new Set())?.i).toBe(0);
  expect(chooseRhythmNote(notes, 0, 2000, 0, 2, new Set())).toBeUndefined();
});
