// caseVariants keeps text search identical on SQLite and Postgres.
import { describe, expect, it } from "vitest";
import { caseVariants } from "@/lib/search";

describe("caseVariants", () => {
  it("covers lower, title and upper case once each", () => {
    expect(caseVariants("ravi kumar")).toEqual(["ravi kumar", "Ravi Kumar", "RAVI KUMAR"]);
    expect(caseVariants("Ravi")).toEqual(["Ravi", "ravi", "RAVI"]);
  });
  it("leaves non-Latin scripts intact", () => {
    expect(caseVariants("टमाटर")).toEqual(["टमाटर"]);
  });
});
