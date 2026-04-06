import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// ---------------------------------------------------------------------------
// Mock firebase modules BEFORE importing lib/db
// vi.hoisted() runs before module resolution, making these safe to reference
// inside vi.mock() factory functions.
// ---------------------------------------------------------------------------
const {
  mockGetDoc,
  mockUpdateDoc,
  mockDeleteDoc,
  mockGetDocs,
  mockOnSnapshot,
  mockSetDoc,
  mockCollection,
  mockDoc,
  mockQuery,
  mockWhere,
  mockOrderBy,
  mockLimit,
  mockStartAfter,
} = vi.hoisted(() => ({
  mockGetDoc: vi.fn(),
  mockUpdateDoc: vi.fn(),
  mockDeleteDoc: vi.fn(),
  mockGetDocs: vi.fn(),
  mockOnSnapshot: vi.fn(),
  mockSetDoc: vi.fn(),
  mockCollection: vi.fn(() => ({ type: "collection" })),
  mockDoc: vi.fn(() => ({ type: "docRef", id: "mock-id" })),
  mockQuery: vi.fn((...args: unknown[]) => args[0]),
  mockWhere: vi.fn(() => ({ type: "where" })),
  mockOrderBy: vi.fn(() => ({ type: "orderBy" })),
  mockLimit: vi.fn(() => ({ type: "limit" })),
  mockStartAfter: vi.fn(() => ({ type: "startAfter" })),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));

vi.mock("firebase/firestore", () => ({
  collection: mockCollection,
  doc: mockDoc,
  setDoc: mockSetDoc,
  getDoc: mockGetDoc,
  updateDoc: mockUpdateDoc,
  deleteDoc: mockDeleteDoc,
  getDocs: mockGetDocs,
  onSnapshot: mockOnSnapshot,
  query: mockQuery,
  where: mockWhere,
  orderBy: mockOrderBy,
  limit: mockLimit,
  startAfter: mockStartAfter,
}));

// ---------------------------------------------------------------------------
// Now import the module under test
// ---------------------------------------------------------------------------
import {
  updateConsult,
  deleteConsult,
  searchCompletedConsults,
  fetchAllCompletedConsultsForExport,
  getConsultById,
  subscribeToConsultsByStatus,
  type Consult,
} from "@/lib/db";
import { getUtcRangeForLocalDate } from "@/lib/dateUtils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDocSnapshot(id: string, data: Record<string, unknown> | null, exists = true) {
  return {
    id,
    exists: () => exists,
    data: () => data,
  };
}

function makeQuerySnapshot(docs: ReturnType<typeof makeDocSnapshot>[]) {
  return {
    empty: docs.length === 0,
    docs,
    forEach: (cb: (doc: ReturnType<typeof makeDocSnapshot>) => void) => docs.forEach(cb),
  };
}

// BASE_CONSULT removed

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// getUtcRangeForLocalDate (private) — tested via searchCompletedConsults
// ===========================================================================
describe("getUtcRangeForLocalDate (via searchCompletedConsults)", () => {
  it("filters consults from searchCompletedConsults to the correct UTC day boundary", async () => {
    // Spy on getDocs to capture the queries
    mockGetDocs.mockResolvedValue(makeQuerySnapshot([]));
    await searchCompletedConsults(undefined, "2024-06-15");
    expect(mockGetDocs).toHaveBeenCalledTimes(1);
    // The query is constructed with where clauses for status/createdAt range
    expect(mockWhere).toHaveBeenCalledWith("status", "==", "completed");
    // Two where calls for createdAt range
    const createdAtCalls = (mockWhere as Mock).mock.calls.filter(
      (c) => c[0] === "createdAt"
    );
    expect(createdAtCalls.length).toBe(2);
    const [, op1, start] = createdAtCalls[0];
    const [, op2, endExclusive] = createdAtCalls[1];
    expect(op1).toBe(">=");
    expect(op2).toBe("<");
    // start should be midnight UTC of the requested date
    // (with local TZ offset included; at least the date portion matches)
    expect(start).toContain("2024-06-1");
    expect(endExclusive).toContain("2024-06-1");
  });
});

// ===========================================================================
// Pure getUtcRangeForLocalDate logic (tested via imported function)
// ===========================================================================
describe("getUtcRangeForLocalDate logic (pure function)", () => {
  it("returns ISO strings", () => {
    const { start, endExclusive } = getUtcRangeForLocalDate("2024-01-15");
    expect(start).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(endExclusive).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("start is strictly before end", () => {
    const { start, endExclusive } = getUtcRangeForLocalDate("2024-01-15");
    expect(new Date(start).getTime()).toBeLessThan(new Date(endExclusive).getTime());
  });

  it("end is exactly 24 hours after start when offset is the same", () => {
    // Use explicit 0-offset (UTC) to get clean boundaries
    const { start, endExclusive } = getUtcRangeForLocalDate("2024-06-15", 0);
    const diff = new Date(endExclusive).getTime() - new Date(start).getTime();
    expect(diff).toBe(24 * 60 * 60 * 1000);
  });

  it("with explicit 0 offset, start is midnight UTC for the given date", () => {
    const { start } = getUtcRangeForLocalDate("2024-03-20", 0);
    expect(start).toBe("2024-03-20T00:00:00.000Z");
  });

  it("with explicit 0 offset, end is midnight UTC the following day", () => {
    const { endExclusive } = getUtcRangeForLocalDate("2024-03-20", 0);
    expect(endExclusive).toBe("2024-03-21T00:00:00.000Z");
  });

  it("respects positive UTC offset (e.g. UTC+7 = -420 minutes)", () => {
    // Thailand is UTC+7, JS getTimezoneOffset returns -420 for UTC+7
    const { start } = getUtcRangeForLocalDate("2024-01-01", -420);
    // midnight local (UTC+7) = 17:00 previous day UTC
    expect(start).toBe("2023-12-31T17:00:00.000Z");
  });

  it("handles month boundary correctly", () => {
    const { start, endExclusive } = getUtcRangeForLocalDate("2024-01-31", 0);
    expect(start).toBe("2024-01-31T00:00:00.000Z");
    expect(endExclusive).toBe("2024-02-01T00:00:00.000Z");
  });

  it("handles year boundary correctly", () => {
    const { start, endExclusive } = getUtcRangeForLocalDate("2024-12-31", 0);
    expect(start).toBe("2024-12-31T00:00:00.000Z");
    expect(endExclusive).toBe("2025-01-01T00:00:00.000Z");
  });

  it("handles leap day", () => {
    const { start, endExclusive } = getUtcRangeForLocalDate("2024-02-29", 0);
    expect(start).toBe("2024-02-29T00:00:00.000Z");
    expect(endExclusive).toBe("2024-03-01T00:00:00.000Z");
  });
});

// ===========================================================================
// mapDocToConsult logic — tested via exported functions
// ===========================================================================
describe("mapDocToConsult (via getConsultById)", () => {
  it("defaults firstName/lastName to empty string when undefined", async () => {
    const docData = {
      hn: "999",
      room: "NT",
      problem: "Test",
      createdAt: "2024-01-01T00:00:00.000Z",
      status: "pending",
      isUrgent: false,
      departments: {},
    };
    mockGetDoc.mockResolvedValue(makeDocSnapshot("doc-1", docData));
    const result = await getConsultById("doc-1");
    expect(result?.firstName).toBe("");
    expect(result?.lastName).toBe("");
  });

  it("preserves firstName/lastName when present", async () => {
    const docData = {
      hn: "999",
      firstName: "Alice",
      lastName: "Smith",
      room: "NT",
      problem: "Test",
      createdAt: "2024-01-01T00:00:00.000Z",
      status: "pending",
      isUrgent: false,
      departments: {},
    };
    mockGetDoc.mockResolvedValue(makeDocSnapshot("doc-1", docData));
    const result = await getConsultById("doc-1");
    expect(result?.firstName).toBe("Alice");
    expect(result?.lastName).toBe("Smith");
  });

  it("returns undefined when document does not exist", async () => {
    mockGetDoc.mockResolvedValue(makeDocSnapshot("doc-missing", null, false));
    const result = await getConsultById("doc-missing");
    expect(result).toBeUndefined();
  });

  it("attaches the document id correctly", async () => {
    const docData = {
      hn: "777",
      room: "NT",
      problem: "Test",
      createdAt: "2024-01-01T00:00:00.000Z",
      status: "pending",
      isUrgent: false,
      departments: {},
    };
    mockGetDoc.mockResolvedValue(makeDocSnapshot("real-id-123", docData));
    const result = await getConsultById("real-id-123");
    expect(result?.id).toBe("real-id-123");
  });
});

// ===========================================================================
// updateConsult — new API
// ===========================================================================
describe("updateConsult", () => {
  const existingData = {
    hn: "123456",
    firstName: "Jane",
    lastName: "Doe",
    room: "Urgent",
    problem: "Headache",
    createdAt: "2024-01-10T08:00:00.000Z",
    status: "pending",
    isUrgent: false,
    departments: {
      "Gen Sx": { status: "pending", completedAt: null, acceptedAt: null },
    },
  };

  describe("with function updater (awaitRemote: true by default)", () => {
    it("calls the updater with current consult data", async () => {
      mockGetDoc.mockResolvedValue(makeDocSnapshot("case-1", existingData));
      mockUpdateDoc.mockResolvedValue(undefined);

      const updater = vi.fn().mockReturnValue({ status: "completed" });
      await updateConsult("case-1", updater);

      expect(updater).toHaveBeenCalledTimes(1);
      const calledWith = updater.mock.calls[0][0] as Consult;
      // id comes from docSnap.id (the document snapshot id), not the docRef mock id
      expect(calledWith.id).toBe("case-1");
      expect(calledWith.hn).toBe("123456");
    });

    it("calls updateDoc with the result of the updater", async () => {
      mockGetDoc.mockResolvedValue(makeDocSnapshot("case-1", existingData));
      mockUpdateDoc.mockResolvedValue(undefined);

      await updateConsult("case-1", () => ({ status: "completed" as const }));

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        { status: "completed" }
      );
    });

    it("returns merged consult with updates applied", async () => {
      mockGetDoc.mockResolvedValue(makeDocSnapshot("case-1", existingData));
      mockUpdateDoc.mockResolvedValue(undefined);

      const result = await updateConsult("case-1", () => ({ status: "completed" as const }));
 
      expect(result.consult?.status).toBe("completed");
      expect(result.consult?.hn).toBe("123456");
      expect(result.isQueued).toBe(false);
    });

    it("throws when document does not exist", async () => {
      mockGetDoc.mockResolvedValue(makeDocSnapshot("missing", null, false));

      await expect(
        updateConsult("missing", () => ({ status: "completed" as const }))
      ).rejects.toThrow("Consult not found: missing");
    });
  });

  describe("with function updater (awaitRemote: false — optimistic path)", () => {
    it("does NOT await updateDoc — fires in background", async () => {
      mockGetDoc.mockResolvedValue(makeDocSnapshot("case-1", existingData));
      // Return a never-resolving promise to verify we don't wait for it
      mockUpdateDoc.mockReturnValue(new Promise(() => {}));

      const result = await updateConsult(
        "case-1",
        () => ({ status: "completed" as const }),
        { awaitRemote: false }
      );

      // Should still return optimistic merged data
      expect(result.consult?.status).toBe("completed");
      expect(result.isQueued).toBe(true);
      expect(result.backgroundPromise).toBeDefined();
      // updateDoc was called but we didn't await it
      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    });

    it("calls onBackgroundError when background updateDoc rejects", async () => {
      mockGetDoc.mockResolvedValue(makeDocSnapshot("case-1", existingData));
      const bgError = new Error("network failure");
      mockUpdateDoc.mockRejectedValue(bgError);

      const onBackgroundError = vi.fn();
      await updateConsult(
        "case-1",
        () => ({ status: "completed" as const }),
        { awaitRemote: false, onBackgroundError }
      );

      // Give microtasks a chance to run
      await new Promise((r) => setTimeout(r, 0));
      expect(onBackgroundError).toHaveBeenCalledWith(bgError);
    });

    it("throws synchronously when document does not exist", async () => {
      mockGetDoc.mockResolvedValue(makeDocSnapshot("missing", null, false));

      await expect(
        updateConsult(
          "missing",
          () => ({ status: "completed" as const }),
          { awaitRemote: false }
        )
      ).rejects.toThrow("Consult not found: missing");
    });
  });

  describe("with plain object updates (awaitRemote: true by default)", () => {
    it("calls updateDoc with the plain object", async () => {
      mockUpdateDoc.mockResolvedValue(undefined);
      const updates = { status: "completed" as const };

      await updateConsult("case-1", updates);

      expect(mockUpdateDoc).toHaveBeenCalledWith(expect.anything(), updates);
    });

    it("returns null for plain object updates", async () => {
      mockUpdateDoc.mockResolvedValue(undefined);
      const result = await updateConsult("case-1", { status: "completed" as const });
      expect(result.consult).toBeNull();
      expect(result.isQueued).toBe(false);
    });
  });

  describe("with plain object updates (awaitRemote: false)", () => {
    it("fires updateDoc without awaiting and returns null", async () => {
      mockUpdateDoc.mockReturnValue(new Promise(() => {}));
      const result = await updateConsult(
        "case-1",
        { status: "completed" as const },
        { awaitRemote: false }
      );
      expect(result.consult).toBeNull();
      expect(result.isQueued).toBe(true);
      expect(result.backgroundPromise).toBeDefined();
      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    });

    it("calls onBackgroundError when fire-and-forget updateDoc rejects", async () => {
      const bgError = new Error("offline");
      mockUpdateDoc.mockRejectedValue(bgError);

      const onBackgroundError = vi.fn();
      await updateConsult(
        "case-1",
        { status: "completed" as const },
        { awaitRemote: false, onBackgroundError }
      );

      await new Promise((r) => setTimeout(r, 0));
      expect(onBackgroundError).toHaveBeenCalledWith(bgError);
    });
  });
});

// ===========================================================================
// deleteConsult
// ===========================================================================
describe("deleteConsult", () => {
  it("calls deleteDoc when document exists", async () => {
    mockGetDoc.mockResolvedValue(makeDocSnapshot("case-1", {}, true));
    mockDeleteDoc.mockResolvedValue(undefined);

    await deleteConsult("case-1");

    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
  });

  it("throws when document does not exist and allowMissing is false", async () => {
    mockGetDoc.mockResolvedValue(makeDocSnapshot("missing", null, false));

    await expect(deleteConsult("missing")).rejects.toThrow(
      "Consult not found: missing"
    );
    expect(mockDeleteDoc).not.toHaveBeenCalled();
  });

  it("calls deleteDoc without existence check when allowMissing is true", async () => {
    mockDeleteDoc.mockResolvedValue(undefined);

    await deleteConsult("any-id", true);

    expect(mockGetDoc).not.toHaveBeenCalled();
    expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// searchCompletedConsults
// ===========================================================================
describe("searchCompletedConsults", () => {
  it("returns empty array when both searchHN and filterDate are omitted", async () => {
    const result = await searchCompletedConsults();
    expect(result).toEqual([]);
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it("returns empty array when both searchHN and filterDate are empty strings", async () => {
    const result = await searchCompletedConsults("", "");
    expect(result).toEqual([]);
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it("queries by HN prefix when searchHN is provided", async () => {
    const docData = {
      hn: "123456",
      firstName: "A",
      lastName: "B",
      room: "NT",
      problem: "P",
      createdAt: "2024-01-01T00:00:00.000Z",
      status: "completed",
      isUrgent: false,
      departments: {},
    };
    mockGetDocs.mockResolvedValue(makeQuerySnapshot([makeDocSnapshot("c1", docData)]));

    const result = await searchCompletedConsults("123456");

    expect(mockGetDocs).toHaveBeenCalledTimes(1);
    // Verify HN range query was built
    const whereCalls = (mockWhere as Mock).mock.calls;
    const hnCalls = whereCalls.filter((c) => c[0] === "hn");
    expect(hnCalls.length).toBe(2);
    expect(hnCalls[0][1]).toBe(">=");
    expect(hnCalls[1][1]).toBe("<");
    expect(result).toHaveLength(1);
    expect(result[0].hn).toBe("123456");
  });

  it("filters out documents without hn", async () => {
    const withHn = {
      hn: "111",
      firstName: "",
      lastName: "",
      room: "NT",
      problem: "P",
      createdAt: "2024-01-01T00:00:00.000Z",
      status: "completed",
      isUrgent: false,
      departments: {},
    };
    const withoutHn = {
      firstName: "",
      lastName: "",
      room: "NT",
      problem: "P",
      createdAt: "2024-01-01T00:00:00.000Z",
      status: "completed",
      isUrgent: false,
      departments: {},
    };
    mockGetDocs.mockResolvedValue(
      makeQuerySnapshot([
        makeDocSnapshot("c1", withHn),
        makeDocSnapshot("c2", withoutHn),
      ])
    );

    const result = await searchCompletedConsults("111");
    expect(result).toHaveLength(1);
    expect(result[0].hn).toBe("111");
  });

  it("sorts results by createdAt descending when searching by HN", async () => {
    const older = {
      hn: "555",
      firstName: "",
      lastName: "",
      room: "NT",
      problem: "Old",
      createdAt: "2024-01-01T00:00:00.000Z",
      status: "completed",
      isUrgent: false,
      departments: {},
    };
    const newer = {
      hn: "555",
      firstName: "",
      lastName: "",
      room: "NT",
      problem: "New",
      createdAt: "2024-06-01T00:00:00.000Z",
      status: "completed",
      isUrgent: false,
      departments: {},
    };
    mockGetDocs.mockResolvedValue(
      makeQuerySnapshot([makeDocSnapshot("c1", older), makeDocSnapshot("c2", newer)])
    );

    const result = await searchCompletedConsults("555");
    expect(result[0].createdAt).toBe("2024-06-01T00:00:00.000Z");
    expect(result[1].createdAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("queries by date range when only filterDate is provided", async () => {
    mockGetDocs.mockResolvedValue(makeQuerySnapshot([]));
    await searchCompletedConsults(undefined, "2024-05-10");

    const whereCalls = (mockWhere as Mock).mock.calls;
    expect(whereCalls.some((c) => c[0] === "status" && c[2] === "completed")).toBe(true);
    expect(whereCalls.some((c) => c[0] === "createdAt" && c[1] === ">=")).toBe(true);
    expect(whereCalls.some((c) => c[0] === "createdAt" && c[1] === "<")).toBe(true);
  });

  it("applies date filter client-side when both HN and filterDate are provided", async () => {
    // Doc inside the date range (UTC: 2024-05-10 midnight, offset 0)
    const inside = {
      hn: "789",
      firstName: "",
      lastName: "",
      room: "NT",
      problem: "P",
      createdAt: "2024-05-10T12:00:00.000Z",
      status: "completed",
      isUrgent: false,
      departments: {},
    };
    // Doc outside the date range
    const outside = {
      hn: "789",
      firstName: "",
      lastName: "",
      room: "NT",
      problem: "P",
      createdAt: "2024-05-11T12:00:00.000Z",
      status: "completed",
      isUrgent: false,
      departments: {},
    };
    mockGetDocs.mockResolvedValue(
      makeQuerySnapshot([makeDocSnapshot("c1", inside), makeDocSnapshot("c2", outside)])
    );

    // Mock timezone offset to UTC (0 minutes)
    const offsetSpy = vi.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(0);

    try {
      const result = await searchCompletedConsults("789", "2024-05-10");
      const outsideIncluded = result.find((c) => c.createdAt === "2024-05-11T12:00:00.000Z");
      expect(outsideIncluded).toBeUndefined();
    } finally {
      // Restore timezone offset
      offsetSpy.mockRestore();
    }
  });
});

// ===========================================================================
// fetchAllCompletedConsultsForExport
// ===========================================================================
describe("fetchAllCompletedConsultsForExport", () => {
  function makeConsultData(hn: string, createdAt: string) {
    return {
      hn,
      firstName: "",
      lastName: "",
      room: "NT",
      problem: "P",
      createdAt,
      status: "completed",
      isUrgent: false,
      departments: {},
    };
  }

  it("returns empty list when no documents found", async () => {
    mockGetDocs.mockResolvedValue(makeQuerySnapshot([]));

    const result = await fetchAllCompletedConsultsForExport("2024-01-01", "2024-01-31");

    expect(result.consults).toEqual([]);
    expect(result.truncated).toBe(false);
    expect(result.consults).toHaveLength(0);
  });

  it("returns all consults and truncated=false when under MAX_RESULTS", async () => {
    const docs = Array.from({ length: 3 }, (_, i) =>
      makeDocSnapshot(`c${i}`, makeConsultData(`HN${i}`, `2024-01-0${i + 1}T00:00:00.000Z`))
    );
    mockGetDocs.mockResolvedValue(makeQuerySnapshot(docs));

    const result = await fetchAllCompletedConsultsForExport("2024-01-01", "2024-01-31");

    expect(result.consults).toHaveLength(3);
    expect(result.truncated).toBe(false);
    expect(result.consults).toHaveLength(3);
  });

  it("fetches next batch using cursor pagination when batch is full", async () => {
    // First batch returns BATCH_SIZE (1000) docs
    const BATCH_SIZE = 1000;
    const firstBatch = Array.from({ length: BATCH_SIZE }, (_, i) =>
      makeDocSnapshot(`c${i}`, makeConsultData(`HN${i}`, `2024-01-01T00:00:00.000Z`))
    );
    const secondBatch = Array.from({ length: 2 }, (_, i) =>
      makeDocSnapshot(`c${BATCH_SIZE + i}`, makeConsultData(`HN${BATCH_SIZE + i}`, `2024-01-02T00:00:00.000Z`))
    );

    mockGetDocs
      .mockResolvedValueOnce(makeQuerySnapshot(firstBatch))
      .mockResolvedValueOnce(makeQuerySnapshot(secondBatch));

    const result = await fetchAllCompletedConsultsForExport("2024-01-01", "2024-01-31");

    expect(mockGetDocs).toHaveBeenCalledTimes(2);
    expect(result.consults).toHaveLength(BATCH_SIZE + 2);
    expect(result.truncated).toBe(false);
    expect(mockStartAfter).toHaveBeenCalledTimes(1);
  });

  it("truncates results at MAX_RESULTS (50000)", async () => {
    const BATCH_SIZE = 1000;
    const MAX_RESULTS = 50000;
    const batches = Math.ceil(MAX_RESULTS / BATCH_SIZE);

    // Every batch is full, so it'll keep fetching until MAX_RESULTS reached
    const fullBatch = Array.from({ length: BATCH_SIZE }, (_, i) =>
      makeDocSnapshot(`c${i}`, makeConsultData(`HN${i}`, `2024-01-01T00:00:00.000Z`))
    );
    // Mock the same batch repeatedly
    mockGetDocs.mockResolvedValue(makeQuerySnapshot(fullBatch));

    const result = await fetchAllCompletedConsultsForExport("2024-01-01", "2024-01-31");

    expect(result.truncated).toBe(true);
    expect(result.consults.length).toBe(MAX_RESULTS);
    // With the updated logic (length > MAX_RESULTS), a full last batch
    // doesn't trigger truncation yet, so it attempts to fetch one more.
    expect(mockGetDocs).toHaveBeenCalledTimes(batches + 1);
  });

  it("filters out documents without hn in each batch", async () => {
    const validDoc = makeDocSnapshot("c1", makeConsultData("HN1", "2024-01-01T00:00:00.000Z"));
    const noHnDoc = makeDocSnapshot("c2", {
      firstName: "",
      lastName: "",
      room: "NT",
      problem: "P",
      createdAt: "2024-01-01T00:00:00.000Z",
      status: "completed",
      isUrgent: false,
      departments: {},
    });
    mockGetDocs.mockResolvedValue(makeQuerySnapshot([validDoc, noHnDoc]));

    const result = await fetchAllCompletedConsultsForExport("2024-01-01", "2024-01-31");

    expect(result.consults).toHaveLength(1);
    expect(result.consults[0].hn).toBe("HN1");
  });
});

// ===========================================================================
// subscribeToConsultsByStatus — changed to filter by hn presence
// ===========================================================================
describe("subscribeToConsultsByStatus", () => {
  it("calls onSnapshot and returns unsubscribe function", () => {
    const unsubscribeFn = vi.fn();
    mockOnSnapshot.mockReturnValue(unsubscribeFn);

    const unsubscribe = subscribeToConsultsByStatus("pending", vi.fn());
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
    expect(unsubscribeFn).toHaveBeenCalledTimes(1);
  });

  it("filters documents without hn before calling onData", () => {
    const withHn = {
      id: "c1",
      hn: "123",
      firstName: "A",
      lastName: "B",
      room: "NT",
      problem: "P",
      createdAt: "2024-01-01T00:00:00.000Z",
      status: "pending",
      isUrgent: false,
      departments: {},
    };
    const withoutHn = {
      id: "c2",
      firstName: "A",
      lastName: "B",
      room: "NT",
      problem: "P",
      createdAt: "2024-01-01T00:00:00.000Z",
      status: "pending",
      isUrgent: false,
      departments: {},
    };

    const docs = [makeDocSnapshot("c1", withHn), makeDocSnapshot("c2", withoutHn)];
    const snapshot = { forEach: (cb: (d: typeof docs[0]) => void) => docs.forEach(cb) };

    mockOnSnapshot.mockImplementation((_q: unknown, onNext: (snap: typeof snapshot) => void) => {
      onNext(snapshot);
      return vi.fn();
    });

    const onData = vi.fn();
    subscribeToConsultsByStatus("pending", onData);

    expect(onData).toHaveBeenCalledTimes(1);
    const receivedConsults = onData.mock.calls[0][0] as Consult[];
    expect(receivedConsults).toHaveLength(1);
    expect(receivedConsults[0].hn).toBe("123");
  });

  it("calls onError callback when snapshot errors", () => {
    const err = new Error("Firestore error");
    mockOnSnapshot.mockImplementation(
      (_q: unknown, _onNext: unknown, onError: (e: Error) => void) => {
        onError(err);
        return vi.fn();
      }
    );

    const onError = vi.fn();
    subscribeToConsultsByStatus("pending", vi.fn(), onError);
    expect(onError).toHaveBeenCalledWith(err);
  });
});