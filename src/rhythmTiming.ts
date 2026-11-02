type Note = { at: number; lane: number };
export function chooseRhythmNote(
  notes: Note[],
  startsAt: number,
  now: number,
  adjust: number,
  lane: number,
  unavailable: Set<number>,
) {
  const candidates = notes
    .map((note, i) => ({
      ...note,
      i,
      delta: Math.abs(startsAt + note.at + 150 + adjust - now),
    }))
    .filter((note) => !unavailable.has(note.i) && note.delta <= 320)
    .sort((a, b) => a.delta - b.delta);
  // A missed note in another lane must not consume a correct nearby keypress.
  return (
    candidates.find((note) => note.lane === lane && note.delta <= 240) ??
    candidates[0]
  );
}
