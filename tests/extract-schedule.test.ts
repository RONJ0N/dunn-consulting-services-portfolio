import { describe, expect, it } from "vitest";
import { extractFromScheduleCsv } from "@/lib/ingest/extract-schedule";

const SAMPLE = `class_name,day,start_time,end_time,instructor,level
Spin,Monday,06:00,07:00,Alex,All levels
Yoga Flow,Tuesday,18:00,19:00,Sam,Beginner
HIIT,Wednesday,17:30,18:15,Jordan,Intermediate
`;

describe("extractFromScheduleCsv", () => {
  it("turns CSV rows into chunks with stable ids", async () => {
    const result = await extractFromScheduleCsv(SAMPLE, { source: "test.csv" });
    expect(result.chunks).toHaveLength(3);
    expect(result.chunks[0].id).toMatch(/^class-spin/);
    expect(result.chunks[0].category).toBe("classes");
    expect(result.chunks[0].content).toMatch(/Spin runs Monday at 06:00/);
  });

  it("throws on missing required columns", async () => {
    await expect(
      extractFromScheduleCsv("foo,bar\n1,2\n", { source: "broken.csv" }),
    ).rejects.toThrow(/Schedule CSV could not be parsed/);
  });
});
