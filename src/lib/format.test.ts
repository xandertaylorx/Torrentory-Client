import { expect, it } from "vitest";
import { limitLabel, plainNotes } from "./format";

it("turns release Markdown into short plain notes", () => {
  const notes = plainNotes("## Highlights\n\nNow checks **updates** at [launch](https://example.com).\n\n```sh\ncurl x | bash\n```\n\nSecond `paragraph`.");
  expect(notes).toBe("Highlights\n\nNow checks updates at launch.\n\nSecond paragraph.");
});

it("truncates long notes at a word boundary", () => {
  const notes = plainNotes("word ".repeat(200), 100);
  expect(notes.endsWith("…")).toBe(true);
  expect(notes.length).toBeLessThanOrEqual(101);
});

it("labels speed limits", () => {
  expect(limitLabel(0)).toBe("Unlimited");
  expect(limitLabel(512)).toBe("512 KB/s");
  expect(limitLabel(1024)).toBe("1 MB/s");
  expect(limitLabel(1536)).toBe("1.5 MB/s");
  expect(limitLabel(Number.NaN)).toBe("Unlimited");
});
