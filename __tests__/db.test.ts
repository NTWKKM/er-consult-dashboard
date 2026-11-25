import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";

// ---------------------------------------------------------------------------
// Mock firebase modules BEFORE importing lib/db
// vi.hoisted() runs before module resolution, making these safe to reference
// inside vi.mock() factory functions.
// ---------------------------------------------------------------------------
const {
  mockGetDoc,
  mockGetDocFromCache,
  mockGetDocFromServer,
  mockUpdateDoc,
  mockDeleteDoc,
  mockGetDocs,
  mockOnSnapshot,
  mockSetDoc,
  mockRunTransaction,
  mockCollection,
  mockDoc,
  mockQuery,
  mockWhere,
  mockOrderBy,
  mockLimit,
  mockStartAfter,
  mockArrayUnion,
} = vi.hoisted(() => ({
  mockGetDoc: vi.fn(),
  mockGetDocFromCache: vi.fn(),
  mockGetDocFromServer: vi.fn(),
  mockUpdateDoc: vi.fn(),
  mockDeleteDoc: vi.fn(),
  mockGetDocs: vi.fn(),
  mockOnSnapshot: vi.fn(),
  mockSetDoc: vi.fn(),
  mockRunTransaction: vi.fn(),
  mockCollection: vi.fn(() => ({ type: "collection" })),
  mockDoc: vi.fn(() => ({ type: "docRef", id: "mock-id" })),
  mockQuery: vi.fn((...args: unknown[]) => args[0]),
  mockWhere: vi.fn(() => ({ type: "where" })),
  mockOrderBy: vi.fn(() => ({ type: "orderBy" })),
  mockLimit: vi.fn((n?: number) => ({ type: "limit", n })),
  mockStartAfter: vi.fn(() => ({ type: "startAfter" })),
  mockArrayUnion: vi.fn((...elements: unknown[]) => ({ type: "arrayUnion", elements })),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));

vi.mock("firebase/firestore", () => ({
  collection: mockCollection,
  doc: mockDoc,
  setDoc: mockSetDoc,
  getDoc: mockGetDoc,
  getDocFromCache: mockGetDocFromCache,
  getDocFromServer: mockGetDocFromServer,
  updateDoc: mockUpdateDoc,
  deleteDoc: mockDeleteDoc,
  getDocs: mockGetDocs,
  runTransaction: mockRunTransaction,
  onSnapshot: mockOnSnapshot,
  query: mockQuery,
  where: mockWhere,
  orderBy: mockOrderBy,
  limit: mockLimit,
  startAfter: mockStartAfter,
  arrayUnion: mockArrayUnion,
}));

// ---------------------------------------------------------------------------
// Now import the module under test
// ---------------------------------------------------------------------------
import {
  addConsult,
  clearRetainedSubmitDraft,
  getLatestFailedSubmitDraft,
  getRetainedSubmitDraft,
  hasPendingOptimisticWrites,
  subscribeToFailedSubmitDrafts,
  MAX_HN_SEARCH_RESULTS,
  updateConsult,
  transactionalUpdateConsult,
  transferConsultRoom,
  fetchCompletedConsultsPage,
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

function makeQuerySnapshot(
  docs: ReturnType<typeof makeDocSnapshot>[],
  fromCache = false,
  hasPendingWrites = false
) {
  return {
    empty: docs.length === 0,
    docs,
    metadata: { fromCache, hasPendingWrites },
    forEach: (cb: (doc: ReturnType<typeof makeDocSnapshot>) => void) => docs.forEach(cb),
  };
}

// BASE_CONSULT removed

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDoc.mockReset();
  mockGetDocFromCache.mockReset();
  mockGetDocFromCache.mockRejectedValue(new Error("cache miss"));
  mockGetDocFromServer.mockReset();
  mockGetDocFromServer.mockImplementation((...args: unknown[]) => mockGetDoc(...args));
});

// ===========================================================================
// getUtcRangeForLocalDate (private) — tested via searchCompletedConsults
// ===========================================================================
describe("getUtcRangeForLocalDate (via searchCompletedConsults)", () => {
  it("filters consults from searchCompletedConsults using Asia/Bangkok (UTC+7) day boundaries even on UTC devices", async () => {
    // Even if the client device is in UTC (offset 0), hospital queries must stay anchored to Asia/Bangkok (UTC+7)
    const offsetSpy = vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(0);
    
    try {
      mockGetDocs.mockResolvedValue(makeQuerySnapshot([]));
      await searchCompletedConsults(undefined, "2024-06-15");

      expect(mockGetDocs).toHaveBeenCalledTimes(1);
      expect(mockWhere).toHaveBeenCalledWith("status", "==", "completed");

      const createdAtCalls = (mockWhere as Mock).mock.calls.filter((c) => c[0] === "createdAt");
      // เทียบกับเวลาเริ่มและจบของวันนั้นๆ ในเขตเวลา Asia/Bangkok (UTC+7)
      expect(createdAtCalls).toEqual([
        ["createdAt", ">=", "2024-06-14T17:00:00.000Z"],
        ["createdAt", "<", "2024-06-15T17:00:00.000Z"],
      ]);
    } finally {
      // คืนค่า Timezone ปกติเมื่อเทสต์เสร็จ
      offsetSpy.mockRestore();
    }
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
      // Return a pending promise to verify we don't wait for it, then settle so later tests aren't affected
      let resolveUpdate!: () => void;
      mockUpdateDoc.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveUpdate = resolve;
        })
      );

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
      resolveUpdate();
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

  describe("no-op updater (returns null)", () => {
    it("returns consult: null and isQueued: false for awaitRemote: true", async () => {
      mockGetDoc.mockResolvedValue(makeDocSnapshot("case-1", existingData));
      
      const result = await updateConsult("case-1", () => null, { awaitRemote: true });
      
      expect(result.consult).toBeNull();
      expect(result.isQueued).toBe(false);
      expect(mockUpdateDoc).not.toHaveBeenCalled();
    });

    it("returns consult: null and isQueued: false for awaitRemote: false", async () => {
      mockGetDoc.mockResolvedValue(makeDocSnapshot("case-1", existingData));
      
      const result = await updateConsult("case-1", () => null, { awaitRemote: false });
      
      expect(result.consult).toBeNull();
      expect(result.isQueued).toBe(false);
      expect(mockUpdateDoc).not.toHaveBeenCalled();
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
      let resolveUpdate!: () => void;
      mockUpdateDoc.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveUpdate = resolve;
        })
      );
      const result = await updateConsult(
        "case-1",
        { status: "completed" as const },
        { awaitRemote: false }
      );
      expect(result.consult).toBeNull();
      expect(result.isQueued).toBe(true);
      expect(result.backgroundPromise).toBeDefined();
      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
      resolveUpdate();
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
// transactionalUpdateConsult
// ===========================================================================
describe("transactionalUpdateConsult", () => {
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

  /**
   * Helper: sets up mockRunTransaction to invoke the callback with a mock transaction object.
   * The mock transaction.get returns the provided snapshot, and transaction.update is a spy.
   */
  function setupTransaction(docSnapshot: ReturnType<typeof makeDocSnapshot>) {
    const mockTransactionUpdate = vi.fn();
    mockRunTransaction.mockImplementation(async (_db: unknown, cb: (t: unknown) => Promise<unknown>) => {
      const mockTransaction = {
        get: vi.fn().mockResolvedValue(docSnapshot),
        update: mockTransactionUpdate,
      };
      return cb(mockTransaction);
    });
    return { mockTransactionUpdate };
  }

  describe("awaited path (awaitRemote: true)", () => {
    it("runs updater inside transaction and writes updates", async () => {
      const { mockTransactionUpdate } = setupTransaction(makeDocSnapshot("case-1", existingData));

      const result = await transactionalUpdateConsult(
        "case-1",
        () => ({ status: "completed" as const }),
      );

      expect(mockRunTransaction).toHaveBeenCalledTimes(1);
      expect(mockTransactionUpdate).toHaveBeenCalledWith(
        expect.anything(),
        { status: "completed" },
      );
      expect(result.applied).toBe(true);
      expect(result.consult?.status).toBe("completed");
      expect(result.isQueued).toBe(false);
    });

    it("returns applied: false when updater returns null (condition not met)", async () => {
      setupTransaction(makeDocSnapshot("case-1", existingData));

      const result = await transactionalUpdateConsult(
        "case-1",
        () => null,
      );

      expect(result.applied).toBe(false);
      expect(result.consult).toBeNull();
    });

    it("throws when document does not exist", async () => {
      setupTransaction(makeDocSnapshot("missing", null, false));

      await expect(
        transactionalUpdateConsult("missing", () => ({ status: "completed" as const }))
      ).rejects.toThrow("Consult not found: missing");
    });
  });

  describe("optimistic path (awaitRemote: false)", () => {
    it("returns optimistic result immediately while transaction runs in background", async () => {
      // Pre-read for optimistic response
      mockGetDoc.mockResolvedValue(makeDocSnapshot("case-1", existingData));
      // Transaction stays pending during assertions, then resolves cleanly
      let resolveTx!: (val: unknown) => void;
      mockRunTransaction.mockReturnValue(
        new Promise((resolve) => {
          resolveTx = resolve;
        })
      );

      const result = await transactionalUpdateConsult(
        "case-1",
        () => ({ status: "completed" as const }),
        { awaitRemote: false },
      );

      expect(result.consult?.status).toBe("completed");
      expect(result.isQueued).toBe(true);
      expect(result.applied).toBe(true);
      expect(result.backgroundPromise).toBeDefined();
      resolveTx({ applied: true, consult: null });
    });

    it("regression B1: returns applied=true for dotted-key updates with awaitRemote: false", async () => {
      mockGetDoc.mockResolvedValue(makeDocSnapshot("case-1", existingData));
      let resolveTx!: (val: unknown) => void;
      mockRunTransaction.mockReturnValue(
        new Promise((resolve) => {
          resolveTx = resolve;
        })
      );

      const result = await transactionalUpdateConsult(
        "case-1",
        () => ({
          "departments.Gen Sx.acceptedAt": "2024-01-10T09:00:00.000Z",
          "departments.Gen Sx.actionStatus": "รับเคส",
        }),
        { awaitRemote: false },
      );

      expect(result.applied).toBe(true);
      expect(result.isQueued).toBe(true);
      expect(result.backgroundPromise).toBeDefined();
      resolveTx({ applied: true, consult: null });
    });

    it("regression B1: returns applied=false without starting background tx when local precondition fails", async () => {
      mockGetDoc.mockResolvedValue(makeDocSnapshot("case-1", existingData));

      const result = await transactionalUpdateConsult(
        "case-1",
        () => null,
        { awaitRemote: false },
      );

      expect(result.applied).toBe(false);
      expect(result.isQueued).toBe(false);
      expect(result.backgroundPromise).toBeNull();
      expect(mockRunTransaction).not.toHaveBeenCalled();
    });

    it("calls onBackgroundError with TRANSACTION_CONDITION_NOT_MET when condition not met in background", async () => {
      mockGetDoc.mockResolvedValue(makeDocSnapshot("case-1", existingData));
      // Transaction resolves with applied: false
      const { mockTransactionUpdate } = setupTransaction(makeDocSnapshot("case-1", {
        ...existingData,
        departments: { "Gen Sx": { status: "completed", completedAt: "2024-01-10T09:00:00.000Z" } },
      }));

      const onBackgroundError = vi.fn();
      await transactionalUpdateConsult(
        "case-1",
        (current) => {
          if (current.departments["Gen Sx"]?.status !== "pending") return null;
          return { status: "completed" as const };
        },
        { awaitRemote: false, onBackgroundError },
      );

      // Give microtasks a chance to run
      await new Promise((r) => setTimeout(r, 0));
      expect(onBackgroundError).toHaveBeenCalledTimes(1);
      const errorArg = onBackgroundError.mock.calls[0][0] as Error;
      expect(errorArg.message).toBe("TRANSACTION_CONDITION_NOT_MET");
      // transaction.update should NOT have been called
      expect(mockTransactionUpdate).not.toHaveBeenCalled();
    });

    it("calls onBackgroundError when transaction rejects (network error)", async () => {
      mockGetDoc.mockResolvedValue(makeDocSnapshot("case-1", existingData));
      const networkError = new Error("Failed to reach Firestore");
      mockRunTransaction.mockRejectedValue(networkError);

      const onBackgroundError = vi.fn();
      await transactionalUpdateConsult(
        "case-1",
        () => ({ status: "completed" as const }),
        { awaitRemote: false, onBackgroundError },
      );

      await new Promise((r) => setTimeout(r, 0));
      expect(onBackgroundError).toHaveBeenCalledWith(networkError);
    });
  });
});

// ===========================================================================
// searchCompletedConsults
// ===========================================================================
describe("searchCompletedConsults", () => {
  it("returns empty result when both searchHN and filterDate are omitted", async () => {
    const result = await searchCompletedConsults();
    expect(result).toEqual({
      consults: [],
      truncated: false,
      hasMore: false,
      lastDoc: null,
    });
    expect(mockGetDocs).not.toHaveBeenCalled();
  });

  it("returns empty result when both searchHN and filterDate are empty strings", async () => {
    const result = await searchCompletedConsults("", "");
    expect(result).toEqual({
      consults: [],
      truncated: false,
      hasMore: false,
      lastDoc: null,
    });
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
    expect(result.consults).toHaveLength(1);
    expect(result.consults[0].hn).toBe("123456");
    expect(result.truncated).toBe(false);
    expect(result.hasMore).toBe(false);
    expect(result.lastDoc).toBeNull();
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
    expect(result.consults).toHaveLength(1);
    expect(result.consults[0].hn).toBe("111");
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
    expect(result.consults[0].createdAt).toBe("2024-06-01T00:00:00.000Z");
    expect(result.consults[1].createdAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("queries by date range when only filterDate is provided", async () => {
    mockGetDocs.mockResolvedValue(makeQuerySnapshot([]));
    await searchCompletedConsults(undefined, "2024-05-10");

    const whereCalls = (mockWhere as Mock).mock.calls;
    expect(whereCalls.some((c) => c[0] === "status" && c[2] === "completed")).toBe(true);
    expect(whereCalls.some((c) => c[0] === "createdAt" && c[1] === ">=")).toBe(true);
    expect(whereCalls.some((c) => c[0] === "createdAt" && c[1] === "<")).toBe(true);
  });

  it("applies date bounds in server query with inequality ordering when both HN and filterDate are provided", async () => {
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
      expect(result.consults.length).toBe(1);
      expect(result.consults[0].createdAt).toBe("2024-05-10T12:00:00.000Z");
      const outsideIncluded = result.consults.find((c) => c.createdAt === "2024-05-11T12:00:00.000Z");
      expect(outsideIncluded).toBeUndefined();

      // Verify server-side date bounds and inequality ordering before limit(MAX_HN_SEARCH_RESULTS + 1)
      const whereCalls = (mockWhere as Mock).mock.calls;
      expect(whereCalls.some((c) => c[0] === "createdAt" && c[1] === ">=")).toBe(true);
      expect(whereCalls.some((c) => c[0] === "createdAt" && c[1] === "<")).toBe(true);
      expect(mockOrderBy).toHaveBeenNthCalledWith(1, "hn", "asc");
      expect(mockOrderBy).toHaveBeenNthCalledWith(2, "createdAt", "desc");
      expect(mockLimit).toHaveBeenCalledWith(MAX_HN_SEARCH_RESULTS + 1);
    } finally {
      // Restore timezone offset
      offsetSpy.mockRestore();
    }
  });

  it("exposes truncated, hasMore, and continuation lastDoc when HN search exceeds MAX_HN_SEARCH_RESULTS", async () => {
    const docs = Array.from({ length: MAX_HN_SEARCH_RESULTS + 1 }, (_, idx) =>
      makeDocSnapshot(`c-${idx}`, {
        hn: `100${idx}`,
        firstName: "A",
        lastName: "B",
        room: "NT",
        problem: "P",
        createdAt: `2024-05-10T00:${String(idx % 60).padStart(2, "0")}:00.000Z`,
        status: "completed",
        isUrgent: false,
        departments: {},
      })
    );
    mockGetDocs.mockResolvedValueOnce(makeQuerySnapshot(docs));

    const firstPage = await searchCompletedConsults("100");
    expect(firstPage.consults).toHaveLength(MAX_HN_SEARCH_RESULTS);
    expect(firstPage.truncated).toBe(true);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.lastDoc?.id).toBe(`c-${MAX_HN_SEARCH_RESULTS - 1}`);

    mockGetDocs.mockResolvedValueOnce(makeQuerySnapshot([docs[MAX_HN_SEARCH_RESULTS]]));
    const nextPage = await searchCompletedConsults("100", undefined, firstPage.lastDoc!);
    expect(mockStartAfter).toHaveBeenCalledWith(firstPage.lastDoc);
    expect(nextPage.consults).toHaveLength(1);
    expect(nextPage.truncated).toBe(false);
    expect(nextPage.hasMore).toBe(false);
    expect(nextPage.lastDoc).toBeNull();
  });
});

describe("addConsult optimistic draft retention", () => {
  beforeEach(() => {
    clearRetainedSubmitDraft();
  });

  it("retains retryable draft until background write settles, clears on resolve, and preserves on reject", async () => {
    let resolveWrite!: () => void;
    mockSetDoc.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveWrite = resolve;
      })
    );

    const onBackgroundError = vi.fn();
    const onBackgroundSuccess = vi.fn();
    const created = await addConsult(
      {
        hn: "123456",
        firstName: "สมชาย",
        lastName: "ใจดี",
        room: "NT",
        problem: "Pain",
        isUrgent: false,
        status: "pending",
        departments: { "Gen Sx": { status: "pending", completedAt: null } },
      },
      { awaitRemote: false, onBackgroundError, onBackgroundSuccess }
    );

    expect(hasPendingOptimisticWrites()).toBe(true);
    expect(getRetainedSubmitDraft(created.id)?.status).toBe("pending");
    expect(getLatestFailedSubmitDraft()).toBeNull();

    resolveWrite();
    await Promise.resolve();
    await Promise.resolve();

    expect(hasPendingOptimisticWrites()).toBe(false);
    expect(getRetainedSubmitDraft(created.id)).toBeUndefined();
    expect(onBackgroundSuccess).toHaveBeenCalledWith(created);

    // Rejection retains retryable failed draft and invokes onBackgroundError with the draft
    let rejectWrite!: (err: unknown) => void;
    mockSetDoc.mockReturnValueOnce(
      new Promise<void>((_resolve, reject) => {
        rejectWrite = reject;
      })
    );

    const failedConsult = await addConsult(
      {
        hn: "654321",
        firstName: "สมหญิง",
        lastName: "ใจดี",
        room: "Urgent",
        problem: "Fever",
        isUrgent: true,
        status: "pending",
        departments: { Ortho: { status: "pending", completedAt: null } },
      },
      { awaitRemote: false, onBackgroundError }
    );

    const writeError = new Error("permission-denied");
    rejectWrite(writeError);
    await Promise.resolve();
    await Promise.resolve();

    expect(onBackgroundError).toHaveBeenCalledWith(writeError, failedConsult, {
      notifiedListenerCount: 0,
    });
    expect(getRetainedSubmitDraft(failedConsult.id)?.status).toBe("failed");
    expect(getLatestFailedSubmitDraft()?.id).toBe(failedConsult.id);
    clearRetainedSubmitDraft(failedConsult.id);
    expect(getLatestFailedSubmitDraft()).toBeNull();
  });

  it("never persists PHI to sessionStorage and retains drafts in memory only for the active session", async () => {
    window.sessionStorage.clear();
    let resolveOriginalWrite!: () => void;
    mockSetDoc.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveOriginalWrite = resolve;
      })
    );

    const pendingConsult = await addConsult(
      {
        hn: "998877",
        firstName: "Reload",
        lastName: "Patient",
        room: "NT",
        problem: "In-memory only test",
        isUrgent: false,
        status: "pending",
        departments: { "Gen Sx": { status: "pending", completedAt: null } },
      },
      { awaitRemote: false }
    );

    expect(window.sessionStorage.getItem("er_consult_submit_drafts_v1")).toBeNull();
    expect(getRetainedSubmitDraft(pendingConsult.id)?.status).toBe("pending");

    resolveOriginalWrite();
    await Promise.resolve();
    await Promise.resolve();
    expect(getRetainedSubmitDraft(pendingConsult.id)).toBeUndefined();
  });

  it("invalidates outstanding producers when clearRetainedSubmitDraft clears drafts", async () => {
    let rejectWrite!: (err: unknown) => void;
    mockSetDoc.mockReturnValueOnce(
      new Promise<void>((_resolve, reject) => {
        rejectWrite = reject;
      })
    );

    const onBackgroundError = vi.fn();
    const listenerSpy = vi.fn();
    const unsubListener = subscribeToFailedSubmitDrafts(listenerSpy);

    const consult = await addConsult(
      {
        hn: "445566",
        firstName: "Cleared",
        lastName: "BeforeReject",
        room: "NT",
        problem: "Logout clear race",
        isUrgent: false,
        status: "pending",
        departments: { Ortho: { status: "pending", completedAt: null } },
      },
      { awaitRemote: false, onBackgroundError }
    );

    // Clear all drafts (e.g. logout) before the background write settles
    clearRetainedSubmitDraft();
    expect(getRetainedSubmitDraft(consult.id)).toBeUndefined();

    rejectWrite(new Error("permission-denied"));
    await Promise.resolve();
    await Promise.resolve();

    // Cleared producer must NOT resurrect draft or notify consumers
    expect(getRetainedSubmitDraft(consult.id)).toBeUndefined();
    expect(getLatestFailedSubmitDraft()).toBeNull();
    expect(onBackgroundError).not.toHaveBeenCalled();
    expect(listenerSpy).not.toHaveBeenCalled();
    unsubListener();
  });

  it("retires superseded failed draft A in memory when replacement B commits or fails", async () => {
    let rejectFirst!: (err: unknown) => void;
    mockDoc.mockReturnValueOnce({ type: "docRef", id: "draft-a" } as never);
    mockSetDoc.mockReturnValueOnce(new Promise<void>((_resolve, reject) => { rejectFirst = reject; }));

    const draftA = await addConsult(
      {
        hn: "121212",
        firstName: "First",
        lastName: "Failed",
        room: "NT",
        problem: "Draft A",
        isUrgent: false,
        status: "pending",
        departments: { "Gen Sx": { status: "pending", completedAt: null } },
      },
      { awaitRemote: false }
    );
    rejectFirst(new Error("offline-1"));
    await Promise.resolve();
    await Promise.resolve();
    expect(draftA.id).toBe("draft-a");
    expect(getLatestFailedSubmitDraft()?.id).toBe(draftA.id);

    // Retry offline as draft B replacing draft A
    let resolveB!: () => void;
    mockDoc.mockReturnValueOnce({ type: "docRef", id: "draft-b" } as never);
    mockSetDoc.mockReturnValueOnce(new Promise<void>((resolve) => { resolveB = resolve; }));
    const draftB = await addConsult(
      {
        hn: "121212",
        firstName: "First",
        lastName: "Failed",
        room: "NT",
        problem: "Draft B",
        isUrgent: false,
        status: "pending",
        departments: { "Gen Sx": { status: "pending", completedAt: null } },
      },
      { awaitRemote: false, replacesDraftId: draftA.id }
    );
    expect(draftB.id).toBe("draft-b");

    // A stays hidden behind pending replacement B
    expect(getRetainedSubmitDraft(draftA.id)?.status).toBe("failed");
    expect(getRetainedSubmitDraft(draftB.id)?.replacesDraftId).toBe(draftA.id);
    expect(getLatestFailedSubmitDraft()).toBeNull();

    // B commits -> retires A and clears B
    resolveB();
    await Promise.resolve();
    await Promise.resolve();
    expect(getRetainedSubmitDraft(draftA.id)).toBeUndefined();
    expect(getRetainedSubmitDraft(draftB.id)).toBeUndefined();
    expect(getLatestFailedSubmitDraft()).toBeNull();
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
      makeDocSnapshot(`c${i}`, makeConsultData(`${i}`, `2024-01-0${i + 1}T00:00:00.000Z`))
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
      makeDocSnapshot(`c${i}`, makeConsultData(`${i}`, `2024-01-01T00:00:00.000Z`))
    );
    const secondBatch = Array.from({ length: 2 }, (_, i) =>
      makeDocSnapshot(`c${BATCH_SIZE + i}`, makeConsultData(`${BATCH_SIZE + i}`, `2024-01-02T00:00:00.000Z`))
    );

    mockGetDocs
      .mockResolvedValueOnce(makeQuerySnapshot(firstBatch))
      .mockResolvedValueOnce(makeQuerySnapshot(secondBatch));

    const result = await fetchAllCompletedConsultsForExport("2024-01-01", "2024-01-31");

    expect(mockGetDocs).toHaveBeenCalledTimes(2);
    expect(result.consults).toHaveLength(BATCH_SIZE + 2);
    expect(result.truncated).toBe(true);
    expect(result.truncationReason).toBe("unconfirmed_completeness");
    expect(mockStartAfter).toHaveBeenCalledTimes(1);
  });

  it("truncates results at MAX_RESULTS (50000)", async () => {
    const BATCH_SIZE = 1000;
    const MAX_RESULTS = 50000;
    const batches = Math.ceil(MAX_RESULTS / BATCH_SIZE);

    // Every batch is full with distinct document IDs, so it keeps fetching until MAX_RESULTS reached
    let callIndex = 0;
    mockGetDocs.mockImplementation(async () => {
      const batchIdx = callIndex;
      callIndex += 1;
      return makeQuerySnapshot(
        Array.from({ length: BATCH_SIZE }, (_, i) =>
          makeDocSnapshot(
            `b${batchIdx}-c${i}`,
            makeConsultData(`${batchIdx * BATCH_SIZE + i}`, "2024-01-01T00:00:00.000Z")
          )
        )
      );
    });

    const result = await fetchAllCompletedConsultsForExport("2024-01-01", "2024-01-31");

    expect(result.truncated).toBe(true);
    expect(result.consults.length).toBe(MAX_RESULTS);
    // With the updated logic (length > MAX_RESULTS), a full last batch
    // doesn't trigger truncation yet, so it attempts to fetch one more.
    expect(mockGetDocs).toHaveBeenCalledTimes(batches + 1);
  });

  it("stops reading at the scan budget when invalid documents keep valid rows below MAX_RESULTS", async () => {
    const BATCH_SIZE = 1000;
    const VALID_PER_BATCH = 900;
    const TOTAL_BATCHES = 55; // 55 * 900 = 49,500 valid rows (< 50,000)

    const mixedBatches = Array.from({ length: TOTAL_BATCHES }, (_, batchIdx) =>
      Array.from({ length: BATCH_SIZE }, (_, docIdx) => {
        const id = `b${batchIdx}-c${docIdx}`;
        if (docIdx < VALID_PER_BATCH) {
          return makeDocSnapshot(id, makeConsultData(`${batchIdx * BATCH_SIZE + docIdx}`, "2024-01-01T00:00:00.000Z"));
        }
        return makeDocSnapshot(id, {
          firstName: "",
          lastName: "",
          room: "NT",
          problem: "P",
          createdAt: "2024-01-01T00:00:00.000Z",
          status: "completed",
          isUrgent: false,
          departments: {},
        });
      })
    );

    let callIndex = 0;
    mockGetDocs.mockImplementation(async () => {
      if (callIndex === 51) {
        callIndex += 1;
        // 52nd call is the bounded limit(1) lookahead probe
        return makeQuerySnapshot([mixedBatches[51][0]]);
      }
      if (callIndex >= mixedBatches.length) {
        return makeQuerySnapshot([]);
      }
      const docs = mixedBatches[callIndex];
      callIndex += 1;
      return makeQuerySnapshot(docs);
    });

    const result = await fetchAllCompletedConsultsForExport("2024-01-01", "2024-01-31");

    expect(result.truncated).toBe(true);
    expect(result.truncationReason).toBe("limit_exceeded");
    expect(result.consults).toHaveLength(51 * VALID_PER_BATCH);
    // 51 full batches (51,000 scanned) + 1 bounded lookahead read = 52 total reads
    expect(mockGetDocs).toHaveBeenCalledTimes(52);
    expect(mockLimit).toHaveBeenNthCalledWith(52, 1);
    expect(mockStartAfter).toHaveBeenLastCalledWith(mixedBatches[50][BATCH_SIZE - 1]);
  });

  it("marks export as truncated when empty lookahead snapshot comes from cache", async () => {
    const BATCH_SIZE = 1000;
    const VALID_PER_BATCH = 900;
    const EXACT_LIMIT_BATCHES = 51;

    const mixedBatches = Array.from({ length: EXACT_LIMIT_BATCHES }, (_, batchIdx) =>
      Array.from({ length: BATCH_SIZE }, (_, docIdx) => {
        const id = `b${batchIdx}-c${docIdx}`;
        if (docIdx < VALID_PER_BATCH) {
          return makeDocSnapshot(id, makeConsultData(`${batchIdx * BATCH_SIZE + docIdx}`, "2024-01-01T00:00:00.000Z"));
        }
        return makeDocSnapshot(id, {
          firstName: "",
          lastName: "",
          room: "NT",
          problem: "P",
          createdAt: "2024-01-01T00:00:00.000Z",
          status: "completed",
          isUrgent: false,
          departments: {},
        });
      })
    );

    let callIndex = 0;
    mockGetDocs.mockImplementation(async () => {
      if (callIndex >= mixedBatches.length) {
        return makeQuerySnapshot([], true);
      }
      const docs = mixedBatches[callIndex];
      callIndex += 1;
      return makeQuerySnapshot(docs);
    });

    const result = await fetchAllCompletedConsultsForExport("2024-01-01", "2024-01-31");

    expect(result.truncated).toBe(true);
    expect(result.truncationReason).toBe("unconfirmed_completeness");
    expect(result.consults).toHaveLength(EXACT_LIMIT_BATCHES * VALID_PER_BATCH);
    expect(mockGetDocs).toHaveBeenCalledTimes(EXACT_LIMIT_BATCHES + 1);
  });

  it("preserves collected rows and marks export as truncated if lookahead fails", async () => {
    const BATCH_SIZE = 1000;
    const VALID_PER_BATCH = 900;
    const EXACT_LIMIT_BATCHES = 51;

    const mixedBatches = Array.from({ length: EXACT_LIMIT_BATCHES }, (_, batchIdx) =>
      Array.from({ length: BATCH_SIZE }, (_, docIdx) => {
        const id = `b${batchIdx}-c${docIdx}`;
        if (docIdx < VALID_PER_BATCH) {
          return makeDocSnapshot(id, makeConsultData(`${batchIdx * BATCH_SIZE + docIdx}`, "2024-01-01T00:00:00.000Z"));
        }
        return makeDocSnapshot(id, {
          firstName: "",
          lastName: "",
          room: "NT",
          problem: "P",
          createdAt: "2024-01-01T00:00:00.000Z",
          status: "completed",
          isUrgent: false,
          departments: {},
        });
      })
    );

    let callIndex = 0;
    mockGetDocs.mockImplementation(async () => {
      if (callIndex >= mixedBatches.length) {
        throw new Error("Lookahead network error");
      }
      const docs = mixedBatches[callIndex];
      callIndex += 1;
      return makeQuerySnapshot(docs);
    });

    const result = await fetchAllCompletedConsultsForExport("2024-01-01", "2024-01-31");

    expect(result.truncated).toBe(true);
    expect(result.truncationReason).toBe("unconfirmed_completeness");
    expect(result.consults).toHaveLength(EXACT_LIMIT_BATCHES * VALID_PER_BATCH);
    expect(mockGetDocs).toHaveBeenCalledTimes(EXACT_LIMIT_BATCHES + 1);
  });

  it("retains server-confirmed rows and stops without advancing cursor when an ordinary batch comes from cache", async () => {
    const BATCH_SIZE = 1000;
    const firstBatch = Array.from({ length: BATCH_SIZE }, (_, i) =>
      makeDocSnapshot(`c${i}`, makeConsultData(`${i}`, "2024-01-01T00:00:00.000Z"))
    );
    const cachedSecondBatch = [
      makeDocSnapshot("cached-1", makeConsultData("9999", "2024-01-02T00:00:00.000Z")),
    ];

    mockGetDocs
      .mockResolvedValueOnce(makeQuerySnapshot(firstBatch, false))
      .mockResolvedValueOnce(makeQuerySnapshot(cachedSecondBatch, true));

    const result = await fetchAllCompletedConsultsForExport("2024-01-01", "2024-01-31");

    expect(mockGetDocs).toHaveBeenCalledTimes(2);
    expect(mockStartAfter).toHaveBeenCalledTimes(1);
    expect(mockStartAfter).toHaveBeenCalledWith(firstBatch[BATCH_SIZE - 1]);
    expect(result.consults).toHaveLength(BATCH_SIZE);
    expect(result.truncated).toBe(true);
    expect(result.truncationReason).toBe("unconfirmed_completeness");
  });

  it("retains server-confirmed rows and marks export incomplete when a subsequent ordinary batch read rejects", async () => {
    const BATCH_SIZE = 1000;
    const firstBatch = Array.from({ length: BATCH_SIZE }, (_, i) =>
      makeDocSnapshot(`c${i}`, makeConsultData(`${i}`, "2024-01-01T00:00:00.000Z"))
    );

    mockGetDocs
      .mockResolvedValueOnce(makeQuerySnapshot(firstBatch, false))
      .mockRejectedValueOnce(Object.assign(new Error("Missing or insufficient permissions"), { code: "permission-denied" }));

    const result = await fetchAllCompletedConsultsForExport("2024-01-01", "2024-01-31");

    expect(mockGetDocs).toHaveBeenCalledTimes(2);
    expect(mockStartAfter).toHaveBeenCalledTimes(1);
    expect(mockStartAfter).toHaveBeenCalledWith(firstBatch[BATCH_SIZE - 1]);
    expect(result.consults).toHaveLength(BATCH_SIZE);
    expect(result.truncated).toBe(true);
    expect(result.truncationReason).toBe("unconfirmed_completeness");
  });

  it("propagates rejection when the initial ordinary batch read rejects", async () => {
    mockGetDocs.mockRejectedValueOnce(new Error("Initial batch failure"));

    await expect(
      fetchAllCompletedConsultsForExport("2024-01-01", "2024-01-31")
    ).rejects.toThrow("Initial batch failure");
  });

  it("stops scanning after a pending batch read completes when the cancellation signal is aborted", async () => {
    const BATCH_SIZE = 1000;
    const firstBatch = Array.from({ length: BATCH_SIZE }, (_, i) =>
      makeDocSnapshot(`c${i}`, makeConsultData(`${i}`, "2024-01-01T00:00:00.000Z"))
    );
    const controller = new AbortController();

    mockGetDocs.mockImplementationOnce(async () => {
      controller.abort();
      return makeQuerySnapshot(firstBatch, false);
    });

    const result = await fetchAllCompletedConsultsForExport("2024-01-01", "2024-01-31", {
      signal: controller.signal,
    });

    expect(mockGetDocs).toHaveBeenCalledTimes(1);
    expect(result.consults).toEqual([]);
    expect(result.truncated).toBe(true);
    expect(result.truncationReason).toBe("unconfirmed_completeness");
  });

  it("includes a re-consulted case whose createdAt moves forward during ascending pagination without duplicating already scanned cases", async () => {
    const BATCH_SIZE = 1000;
    const firstBatch = Array.from({ length: BATCH_SIZE }, (_, i) =>
      makeDocSnapshot(`c${i}`, makeConsultData(`${i}`, "2024-01-01T00:00:00.000Z"))
    );
    const secondBatch = [
      // Previously unvisited case whose createdAt was moved later by re-consult & re-completion
      makeDocSnapshot("reconsulted-tail", makeConsultData("5001", "2024-01-20T12:00:00.000Z")),
      // Previously scanned case updated forward and seen again in second batch -> should deduplicate
      makeDocSnapshot("c0", makeConsultData("0", "2024-01-21T12:00:00.000Z")),
    ];

    mockGetDocs
      .mockResolvedValueOnce(makeQuerySnapshot(firstBatch, false))
      .mockResolvedValueOnce(makeQuerySnapshot(secondBatch, false));

    const result = await fetchAllCompletedConsultsForExport("2024-01-01", "2024-01-31");

    expect(mockOrderBy).toHaveBeenCalledTimes(2);
    expect(mockOrderBy).toHaveBeenNthCalledWith(1, "createdAt", "asc");
    expect(mockOrderBy).toHaveBeenNthCalledWith(2, "createdAt", "asc");
    expect(mockStartAfter).toHaveBeenCalledWith(firstBatch[BATCH_SIZE - 1]);
    expect(result.truncated).toBe(true);
    expect(result.truncationReason).toBe("unconfirmed_completeness");
    expect(result.consults).toHaveLength(BATCH_SIZE + 1);
    expect(result.consults.find((c) => c.id === "reconsulted-tail")?.hn).toBe("5001");
    expect(result.consults.filter((c) => c.id === "c0")).toHaveLength(1);
    expect(result.consults.find((c) => c.id === "c0")?.createdAt).toBe("2024-01-21T12:00:00.000Z");
  });

  it("marks single-page export as unconfirmed_completeness when snapshot metadata has hasPendingWrites", async () => {
    const docs = [
      makeDocSnapshot("c1", makeConsultData("1", "2024-01-01T00:00:00.000Z")),
    ];
    mockGetDocs.mockResolvedValueOnce(makeQuerySnapshot(docs, false, true));

    const result = await fetchAllCompletedConsultsForExport("2024-01-01", "2024-01-31");

    expect(result.consults).toHaveLength(1);
    expect(result.truncated).toBe(true);
    expect(result.truncationReason).toBe("unconfirmed_completeness");
  });

  it("marks single-page export as unconfirmed_completeness when an optimistic updateConsult write overlaps", async () => {
    mockGetDoc.mockResolvedValueOnce(
      makeDocSnapshot("reconsult-1", makeConsultData("111", "2024-01-05T00:00:00.000Z"))
    );
    let resolveUpdate!: () => void;
    mockUpdateDoc.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveUpdate = resolve;
      })
    );

    await updateConsult(
      "reconsult-1",
      () => ({ status: "pending" as const, createdAt: "2024-01-20T00:00:00.000Z" }),
      { awaitRemote: false }
    );

    mockGetDocs.mockResolvedValueOnce(
      makeQuerySnapshot([makeDocSnapshot("c2", makeConsultData("222", "2024-01-06T00:00:00.000Z"))], false, false)
    );

    const result = await fetchAllCompletedConsultsForExport("2024-01-01", "2024-01-31");

    expect(result.consults).toHaveLength(1);
    expect(result.truncated).toBe(true);
    expect(result.truncationReason).toBe("unconfirmed_completeness");

    resolveUpdate();
  });

  it("stops at the scan limit with unconfirmed_completeness rather than limit_exceeded when lookahead is empty", async () => {
    const BATCH_SIZE = 1000;
    const VALID_PER_BATCH = 900;
    const EXACT_LIMIT_BATCHES = 51; // 51 * 1000 = 51,000 scanned, 45,900 valid rows

    const mixedBatches = Array.from({ length: EXACT_LIMIT_BATCHES }, (_, batchIdx) =>
      Array.from({ length: BATCH_SIZE }, (_, docIdx) => {
        const id = `b${batchIdx}-c${docIdx}`;
        if (docIdx < VALID_PER_BATCH) {
          return makeDocSnapshot(id, makeConsultData(`${batchIdx * BATCH_SIZE + docIdx}`, "2024-01-01T00:00:00.000Z"));
        }
        return makeDocSnapshot(id, {
          firstName: "",
          lastName: "",
          room: "NT",
          problem: "P",
          createdAt: "2024-01-01T00:00:00.000Z",
          status: "completed",
          isUrgent: false,
          departments: {},
        });
      })
    );

    let callIndex = 0;
    mockGetDocs.mockImplementation(async () => {
      if (callIndex >= mixedBatches.length) {
        return makeQuerySnapshot([]);
      }
      const docs = mixedBatches[callIndex];
      callIndex += 1;
      return makeQuerySnapshot(docs);
    });

    const result = await fetchAllCompletedConsultsForExport("2024-01-01", "2024-01-31");

    expect(result.truncated).toBe(true);
    expect(result.truncationReason).toBe("unconfirmed_completeness");
    expect(result.consults).toHaveLength(EXACT_LIMIT_BATCHES * VALID_PER_BATCH);
    expect(mockGetDocs).toHaveBeenCalledTimes(EXACT_LIMIT_BATCHES + 1);
  });

  it("filters out documents without hn in each batch", async () => {
    const validDoc = makeDocSnapshot("c1", makeConsultData("1", "2024-01-01T00:00:00.000Z"));
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
    expect(result.consults[0].hn).toBe("1");
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

// ===========================================================================
// fetchCompletedConsultsPage
// ===========================================================================

describe("fetchCompletedConsultsPage", () => {
  const validPayload = (hn: string) => ({
    hn,
    firstName: "A",
    lastName: "B",
    room: "Urgent",
    problem: "P",
    createdAt: "2026-01-15T08:00:00.000Z",
    status: "completed",
    isUrgent: false,
    departments: {
      "Gen Sx": { status: "completed", completedAt: "2026-01-15T09:00:00.000Z" },
    },
  });

  const invalidPayload = () => ({
    // Missing required fields / invalid HN fails ConsultSchema
    hn: "INVALID",
    status: "completed",
  });

  it("uses bounded batch refills instead of sequential limit(1) queries and anchors lastDoc before undisplayed valid rows", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Page size = 2. First batch requests 3: 2 valid + 1 invalid.
    const v1 = makeDocSnapshot("v1", validPayload("1001"));
    const v2 = makeDocSnapshot("v2", validPayload("1002"));
    const inv1 = makeDocSnapshot("inv1", invalidPayload());

    // Second batch (refillFloor = 10) contains 8 invalid docs, then v3, then v4.
    const invBatch = Array.from({ length: 8 }, (_, idx) =>
      makeDocSnapshot(`inv-b-${idx}`, invalidPayload())
    );
    const lastInvalidBeforeV3 = invBatch[invBatch.length - 1];
    const v3 = makeDocSnapshot("v3", validPayload("1003"));
    const v4 = makeDocSnapshot("v4", validPayload("1004"));

    mockGetDocs
      .mockResolvedValueOnce(makeQuerySnapshot([v1, v2, inv1]))
      .mockResolvedValueOnce(makeQuerySnapshot([...invBatch, v3, v4]));

    const res = await fetchCompletedConsultsPage(2);

    expect(mockGetDocs).toHaveBeenCalledTimes(2);
    expect(mockLimit.mock.calls.map((c) => c[0])).toEqual([3, 10]);
    expect(res.consults.map((c) => c.id)).toEqual(["v1", "v2"]);
    expect(res.hasMore).toBe(true);
    // Continuation must sit immediately before v3 so v3 and v4 are not skipped on the next page
    expect(res.lastDoc).toBe(lastInvalidBeforeV3);

    consoleErrorSpy.mockRestore();
  });

  it("returns hasMore=true and lastScannedDoc when MAX_SCAN_DOCS is hit with zero valid docs", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let seq = 0;

    // For pageSize = 2, MAX_SCAN_DOCS = 250. Return full batches of invalid docs matching requested limit.
    mockGetDocs.mockImplementation(async () => {
      const requestedLimit = mockLimit.mock.calls[mockLimit.mock.calls.length - 1]?.[0] ?? 1;
      const docs = Array.from({ length: requestedLimit }, () => {
        seq += 1;
        return makeDocSnapshot(`bad-${seq}`, invalidPayload());
      });
      return makeQuerySnapshot(docs);
    });

    const res = await fetchCompletedConsultsPage(2);

    expect(res.consults).toEqual([]);
    expect(res.hasMore).toBe(true);
    expect(res.lastDoc?.id).toBe("bad-250");
    expect(seq).toBe(250);

    consoleErrorSpy.mockRestore();
  });

  it("returns hasMore=true and lastScannedDoc when MAX_SCAN_DOCS is hit with partial valid docs", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let seq = 0;

    mockGetDocs.mockImplementation(async () => {
      const requestedLimit = mockLimit.mock.calls[mockLimit.mock.calls.length - 1]?.[0] ?? 1;
      const docs = Array.from({ length: requestedLimit }, () => {
        seq += 1;
        if (seq === 1) {
          return makeDocSnapshot("valid-1", validPayload("2001"));
        }
        return makeDocSnapshot(`bad-${seq}`, invalidPayload());
      });
      return makeQuerySnapshot(docs);
    });

    const res = await fetchCompletedConsultsPage(2);

    expect(res.consults.map((c) => c.id)).toEqual(["valid-1"]);
    expect(res.hasMore).toBe(true);
    expect(res.lastDoc?.id).toBe("bad-250");

    consoleErrorSpy.mockRestore();
  });

  it("returns hasMore=false and lastDoc=null when confirmed end-of-data yields zero valid docs", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Requested batch = 3, only 2 invalid docs exist -> short snapshot confirms end of collection
    mockGetDocs.mockResolvedValueOnce(
      makeQuerySnapshot([
        makeDocSnapshot("bad-1", invalidPayload()),
        makeDocSnapshot("bad-2", invalidPayload()),
      ])
    );

    const res = await fetchCompletedConsultsPage(2);

    expect(res.consults).toEqual([]);
    expect(res.lastDoc).toBeNull();
    expect(res.hasMore).toBe(false);

    consoleErrorSpy.mockRestore();
  });
});

// ===========================================================================
// Offline/cache vs authoritative server checks (CodeRabbit PR #15 fixes)
// ===========================================================================
describe("online authoritative revalidation & offline transfer reconciliation", () => {
  const originalOnLineDescriptor = Object.getOwnPropertyDescriptor(Navigator.prototype, "onLine");

  const setNavigatorOnLine = (value: boolean) => {
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      get: () => value,
    });
  };

  afterEach(() => {
    delete (window.navigator as { onLine?: boolean }).onLine;
    if (originalOnLineDescriptor) {
      Object.defineProperty(Navigator.prototype, "onLine", originalOnLineDescriptor);
    }
  });

  const baseConsult = (overrides: Record<string, unknown> = {}) => ({
    hn: "123456",
    firstName: "Somchai",
    lastName: "Jaidee",
    room: "NT",
    problem: "Abdominal pain",
    createdAt: "2024-01-10T08:00:00.000Z",
    status: "pending",
    isUrgent: false,
    departments: {
      "Gen Sx": { status: "pending", completedAt: null },
    },
    ...overrides,
  });

  it("updateConsult({ awaitRemote: false }) reads authoritative getDoc when online and skips stale cache", async () => {
    setNavigatorOnLine(true);
    mockGetDocFromCache.mockResolvedValue(
      makeDocSnapshot("c-online", baseConsult())
    );
    mockGetDoc.mockResolvedValueOnce(
      makeDocSnapshot(
        "c-online",
        baseConsult({
          status: "completed",
          departments: {
            "Gen Sx": { status: "completed", completedAt: "2024-01-10T09:00:00.000Z" },
          },
        })
      )
    );

    const res = await updateConsult(
      "c-online",
      (current) => {
        if (current.departments["Gen Sx"]?.status !== "pending") return null;
        return { "departments.Gen Sx.admittedAt": "2024-01-10T10:00:00.000Z" };
      },
      { awaitRemote: false }
    );

    expect(mockGetDoc).toHaveBeenCalledTimes(1);
    expect(mockGetDocFromCache).not.toHaveBeenCalled();
    expect(mockUpdateDoc).not.toHaveBeenCalled();
    expect(res.applied).toBe(false);
  });

  it("updateConsult({ awaitRemote: false }) reads local cache when offline", async () => {
    setNavigatorOnLine(false);
    mockGetDocFromCache.mockResolvedValueOnce(makeDocSnapshot("c-offline", baseConsult()));
    mockUpdateDoc.mockResolvedValueOnce(undefined);

    const res = await updateConsult(
      "c-offline",
      (current) => ({
        "departments.Gen Sx.admittedAt":
          current.departments["Gen Sx"]?.status === "pending" ? "2024-01-10T10:00:00.000Z" : null,
      }),
      { awaitRemote: false }
    );

    expect(mockGetDocFromCache).toHaveBeenCalledTimes(1);
    expect(mockGetDoc).not.toHaveBeenCalled();
    expect(res.applied).toBe(true);
    expect(res.isQueued).toBe(true);
  });

  it("transactionalUpdateConsult({ awaitRemote: false }) falls back to server getDoc when cache fails precondition online", async () => {
    setNavigatorOnLine(true);
    // Stale cache shows case already moved to SSW; server actually shows it still in NT
    mockGetDocFromCache.mockResolvedValueOnce(
      makeDocSnapshot("c-stale", baseConsult({ room: "SSW" }))
    );
    mockGetDocFromServer.mockResolvedValueOnce(
      makeDocSnapshot("c-stale", baseConsult({ room: "NT" }))
    );
    mockRunTransaction.mockImplementation(async (_db, fn) =>
      fn({
        get: vi.fn().mockResolvedValue(makeDocSnapshot("c-stale", baseConsult({ room: "NT" }))),
        update: vi.fn(),
      })
    );

    const res = await transactionalUpdateConsult(
      "c-stale",
      (current) => (current.room === "SSW" ? null : { room: "SSW" }),
      { awaitRemote: false }
    );

    expect(mockGetDocFromCache).toHaveBeenCalledTimes(1);
    expect(mockGetDocFromServer).toHaveBeenCalledTimes(1);
    expect(mockGetDoc).not.toHaveBeenCalled();
    expect(res.applied).toBe(true);
    await res.backgroundPromise;
    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
  });

  it("transactionalUpdateConsult({ awaitRemote: false }) uses server-only read on cache miss when online", async () => {
    setNavigatorOnLine(true);
    mockGetDocFromCache.mockRejectedValueOnce(new Error("cache miss"));
    mockGetDocFromServer.mockRejectedValueOnce(new Error("client is offline"));

    await expect(
      transactionalUpdateConsult(
        "c-miss-srv",
        () => ({ room: "SSW" }),
        { awaitRemote: false }
      )
    ).rejects.toThrow(/offline/);

    expect(mockGetDocFromCache).toHaveBeenCalledTimes(1);
    expect(mockGetDocFromServer).toHaveBeenCalledTimes(1);
    expect(mockGetDoc).not.toHaveBeenCalled();
  });

  it("transferConsultRoom queues transfer intent offline without stale updateDoc and commits transactionally on reconnect", async () => {
    setNavigatorOnLine(false);
    // While offline, only Gen Sx is cached as pending; Ortho was completed locally
    mockGetDocFromCache.mockResolvedValueOnce(
      makeDocSnapshot(
        "c-xfer",
        baseConsult({
          room: "NT",
          departments: {
            "Gen Sx": { status: "pending", completedAt: null },
            Ortho: { status: "completed", completedAt: "2024-01-10T08:30:00.000Z" },
          },
        })
      )
    );

    const transactionUpdateSpy = vi.fn();
    mockRunTransaction.mockImplementation(async (_db, fn) => {
      // On reconnect, Ortho was re-consulted remotely so both Gen Sx and Ortho are pending on server
      const latestServerDoc = makeDocSnapshot(
        "c-xfer",
        baseConsult({
          room: "NT",
          departments: {
            "Gen Sx": { status: "pending", completedAt: null },
            Ortho: { status: "pending", completedAt: null },
          },
        })
      );
      return fn({
        get: vi.fn().mockResolvedValue(latestServerDoc),
        update: transactionUpdateSpy,
      });
    });

    const onBackgroundError = vi.fn();
    const res = await transferConsultRoom("c-xfer", "SSW", onBackgroundError);
    expect(res.transferred).toBe(true);
    expect(res.isOfflineQueued).toBe(true);
    expect(res.backgroundPromise).not.toBeNull();
    // Offline path must NOT issue a blind fixed-payload updateDoc or runTransaction while still offline
    expect(mockUpdateDoc).not.toHaveBeenCalled();
    expect(mockRunTransaction).not.toHaveBeenCalled();

    // Simulate network reconnection -> online listener fires deferred transaction
    setNavigatorOnLine(true);
    window.dispatchEvent(new Event("online"));
    await res.backgroundPromise;

    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(transactionUpdateSpy).toHaveBeenCalledTimes(1);
    const txPayload = transactionUpdateSpy.mock.calls[0][1] as Record<string, unknown>;
    expect(txPayload.room).toBe("SSW");
    expect(txPayload["departments.Gen Sx.transfers"]).toBeDefined();
    expect(txPayload["departments.Ortho.transfers"]).toBeDefined();
    expect(onBackgroundError).not.toHaveBeenCalled();
  });

  it("transferConsultRoom aborts deferred offline transfer cleanly on reconnect if all departments completed remotely", async () => {
    setNavigatorOnLine(false);
    mockGetDocFromCache.mockResolvedValueOnce(
      makeDocSnapshot(
        "c-xfer-done",
        baseConsult({
          room: "NT",
          departments: {
            "Gen Sx": { status: "pending", completedAt: null },
          },
        })
      )
    );

    const transactionUpdateSpy = vi.fn();
    mockRunTransaction.mockImplementation(async (_db, fn) => {
      // By the time reconnect happens, another client already completed Gen Sx
      const completedDoc = makeDocSnapshot(
        "c-xfer-done",
        baseConsult({
          room: "NT",
          status: "completed",
          departments: {
            "Gen Sx": { status: "completed", completedAt: "2024-01-10T09:00:00.000Z" },
          },
        })
      );
      return fn({
        get: vi.fn().mockResolvedValue(completedDoc),
        update: transactionUpdateSpy,
      });
    });

    const onBackgroundError = vi.fn();
    const res = await transferConsultRoom("c-xfer-done", "SSW", onBackgroundError);
    expect(res.isOfflineQueued).toBe(true);

    setNavigatorOnLine(true);
    window.dispatchEvent(new Event("online"));
    await res.backgroundPromise;

    expect(mockRunTransaction).toHaveBeenCalledTimes(1);
    expect(transactionUpdateSpy).not.toHaveBeenCalled();
    expect(onBackgroundError).toHaveBeenCalledTimes(1);
    expect((onBackgroundError.mock.calls[0][0] as Error).message).toBe(
      "TRANSACTION_CONDITION_NOT_MET"
    );
  });

  it("updateConsult({ awaitRemote: false }) rejects without queuing when server is unreachable despite online flag", async () => {
    setNavigatorOnLine(true);
    mockGetDocFromCache.mockResolvedValue(makeDocSnapshot("c-srv-fail", baseConsult()));
    mockGetDocFromServer.mockRejectedValueOnce(new Error("Failed to get document because the client is offline"));

    await expect(
      updateConsult(
        "c-srv-fail",
        () => ({ "departments.Gen Sx.admittedAt": "2024-01-10T10:00:00.000Z" }),
        { awaitRemote: false }
      )
    ).rejects.toThrow(/offline/);

    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });

  it("transferConsultRoom supersedes an earlier offline transfer when a newer transfer is queued for the same case", async () => {
    setNavigatorOnLine(false);
    mockGetDocFromCache.mockResolvedValue(
      makeDocSnapshot(
        "c-supersede",
        baseConsult({
          room: "NT",
          departments: { "Gen Sx": { status: "pending", completedAt: null } },
        })
      )
    );

    const committedRooms: string[] = [];
    mockRunTransaction.mockImplementation(async (_db, fn) =>
      fn({
        get: vi.fn().mockResolvedValue(
          makeDocSnapshot(
            "c-supersede",
            baseConsult({
              room: committedRooms.at(-1) ?? "NT",
              departments: { "Gen Sx": { status: "pending", completedAt: null } },
            })
          )
        ),
        update: (_ref: unknown, payload: Record<string, unknown>) => {
          if (typeof payload.room === "string") {
            committedRooms.push(payload.room);
          }
        },
      })
    );

    const first = await transferConsultRoom("c-supersede", "SSW");
    const second = await transferConsultRoom("c-supersede", "Urgent");

    setNavigatorOnLine(true);
    window.dispatchEvent(new Event("online"));
    await Promise.all([first.backgroundPromise, second.backgroundPromise]);

    expect(committedRooms).toEqual(["Urgent"]);
  });

  it("transferConsultRoom preserves queued transfer epoch when a replacement request fails preflight", async () => {
    setNavigatorOnLine(false);
    mockGetDocFromCache.mockResolvedValue(
      makeDocSnapshot(
        "c-keep-epoch",
        baseConsult({
          room: "NT",
          departments: { "Gen Sx": { status: "pending", completedAt: null } },
        })
      )
    );

    const committedRooms: string[] = [];
    mockRunTransaction.mockImplementation(async (_db, fn) =>
      fn({
        get: vi.fn().mockResolvedValue(
          makeDocSnapshot(
            "c-keep-epoch",
            baseConsult({
              room: "NT",
              departments: { "Gen Sx": { status: "pending", completedAt: null } },
            })
          )
        ),
        update: (_ref: unknown, payload: Record<string, unknown>) => {
          if (typeof payload.room === "string") {
            committedRooms.push(payload.room);
          }
        },
      })
    );

    const queued = await transferConsultRoom("c-keep-epoch", "SSW");
    expect(queued.transferred).toBe(true);

    // Replacement fails preflight (same room as current "NT") -> must NOT steal epoch from queued "SSW" transfer
    const failedReplacement = await transferConsultRoom("c-keep-epoch", "NT");
    expect(failedReplacement.transferred).toBe(false);

    setNavigatorOnLine(true);
    window.dispatchEvent(new Event("online"));
    await queued.backgroundPromise;

    expect(committedRooms).toEqual(["SSW"]);
  });

  it("transferConsultRoom aborts superseded transaction inside buildTransferPayload when a newer valid transfer takes ownership mid-flight", async () => {
    setNavigatorOnLine(false);
    mockGetDocFromCache.mockResolvedValue(
      makeDocSnapshot(
        "c-midflight",
        baseConsult({
          room: "NT",
          departments: { "Gen Sx": { status: "pending", completedAt: null } },
        })
      )
    );

    const committedRooms: string[] = [];
    let releaseFirstTxGet!: () => void;
    let firstTxStarted!: () => void;
    const firstTxStartedPromise = new Promise<void>((resolve) => {
      firstTxStarted = resolve;
    });

    let txCount = 0;
    mockRunTransaction.mockImplementation(async (_db, fn) => {
      const idx = ++txCount;
      if (idx === 1) {
        firstTxStarted();
        await new Promise<void>((resolve) => {
          releaseFirstTxGet = resolve;
        });
      }
      return fn({
        get: vi.fn().mockResolvedValue(
          makeDocSnapshot(
            "c-midflight",
            baseConsult({
              room: committedRooms.at(-1) ?? "NT",
              departments: { "Gen Sx": { status: "pending", completedAt: null } },
            })
          )
        ),
        update: (_ref: unknown, payload: Record<string, unknown>) => {
          if (typeof payload.room === "string") {
            committedRooms.push(payload.room);
          }
        },
      });
    });

    const onFirstErr = vi.fn();
    const first = await transferConsultRoom("c-midflight", "SSW", onFirstErr);

    setNavigatorOnLine(true);
    window.dispatchEvent(new Event("online"));
    await firstTxStartedPromise;

    // Second transfer starts while first transaction is mid-flight -> waits until first settles before claiming ownership
    const secondPromise = transferConsultRoom("c-midflight", "Urgent");

    // Unblock first transaction -> completes as owner, then second takes ownership and commits Urgent last
    releaseFirstTxGet();
    const second = await secondPromise;
    await Promise.all([first.backgroundPromise, second.backgroundPromise]);

    expect(committedRooms).toEqual(["SSW", "Urgent"]);
    expect(onFirstErr).not.toHaveBeenCalled();
  });

  it("transferConsultRoom serializes ownership claim with delayed commits, preserving milestones and handling newer transfer failure", async () => {
    setNavigatorOnLine(true);
    mockGetDocFromCache.mockResolvedValue(
      makeDocSnapshot(
        "c-serial",
        baseConsult({
          room: "NT",
          departments: { "Gen Sx": { status: "pending", completedAt: null } },
        })
      )
    );

    const committedWrites: Array<Record<string, unknown>> = [];
    let firstStaged!: () => void;
    const firstStagedPromise = new Promise<void>((resolve) => {
      firstStaged = resolve;
    });
    let releaseFirstCommit!: () => void;
    const releaseFirstCommitPromise = new Promise<void>((resolve) => {
      releaseFirstCommit = resolve;
    });

    let txCount = 0;
    mockRunTransaction.mockImplementation(async (_db, fn) => {
      const idx = ++txCount;
      let stagedPayload: Record<string, unknown> | null = null;
      const result = await fn({
        get: vi.fn().mockResolvedValue(
          makeDocSnapshot(
            "c-serial",
            baseConsult({
              room: (committedWrites.at(-1)?.room as string) ?? "NT",
              departments: { "Gen Sx": { status: "pending", completedAt: null } },
            })
          )
        ),
        update: (_ref: unknown, payload: Record<string, unknown>) => {
          stagedPayload = payload;
          if (idx === 1) {
            firstStaged();
          }
        },
      });
      if (idx === 1) {
        await releaseFirstCommitPromise;
      }
      if (stagedPayload) {
        committedWrites.push(stagedPayload);
      }
      return result;
    });

    const first = await transferConsultRoom("c-serial", "SSW");
    await firstStagedPromise;

    // Invoke newer transfer while first's commit is still in flight -> must wait before claiming ownership or staging
    const secondPromise = transferConsultRoom("c-serial", "Urgent");
    await Promise.resolve();
    expect(txCount).toBe(1);
    expect(committedWrites).toHaveLength(0);

    // Release first commit -> commits SSW + SSW milestone as active owner, then second claims ownership & commits Urgent
    releaseFirstCommit();
    const second = await secondPromise;
    await Promise.all([first.backgroundPromise, second.backgroundPromise]);

    expect(committedWrites).toHaveLength(2);
    expect(committedWrites[0].room).toBe("SSW");
    expect(committedWrites[0]["departments.Gen Sx.transfers"]).toEqual(
      expect.objectContaining({ elements: [expect.objectContaining({ to: "SSW" })] })
    );
    expect(committedWrites[1].room).toBe("Urgent");
    expect(committedWrites[1]["departments.Gen Sx.transfers"]).toEqual(
      expect.objectContaining({ elements: [expect.objectContaining({ to: "Urgent" })] })
    );

    // Case 2: If newer transfer fails after waiting for first's delayed commit, first committed validly as owner
    // and the failed newer transfer writes neither room nor milestone.
    const committedFailWrites: Array<Record<string, unknown>> = [];
    let failFirstStaged!: () => void;
    const failFirstStagedPromise = new Promise<void>((resolve) => {
      failFirstStaged = resolve;
    });
    let releaseFailFirstCommit!: () => void;
    const releaseFailFirstCommitPromise = new Promise<void>((resolve) => {
      releaseFailFirstCommit = resolve;
    });
    let failTxCount = 0;

    mockGetDocFromCache.mockResolvedValue(
      makeDocSnapshot(
        "c-serial-fail",
        baseConsult({
          room: "NT",
          departments: { "Gen Sx": { status: "pending", completedAt: null } },
        })
      )
    );
    mockRunTransaction.mockImplementation(async (_db, fn) => {
      const idx = ++failTxCount;
      let stagedPayload: Record<string, unknown> | null = null;
      const result = await fn({
        get: vi.fn().mockResolvedValue(
          makeDocSnapshot(
            "c-serial-fail",
            baseConsult({
              room: (committedFailWrites.at(-1)?.room as string) ?? "NT",
              departments: { "Gen Sx": { status: "pending", completedAt: null } },
            })
          )
        ),
        update: (_ref: unknown, payload: Record<string, unknown>) => {
          stagedPayload = payload;
          if (idx === 1) {
            failFirstStaged();
          }
        },
      });
      if (idx === 1) {
        await releaseFailFirstCommitPromise;
      } else {
        throw new Error("newer transfer commit failed");
      }
      if (stagedPayload) {
        committedFailWrites.push(stagedPayload);
      }
      return result;
    });

    const onFirstFailErr = vi.fn();
    const onSecondFailErr = vi.fn();
    const firstFailCase = await transferConsultRoom("c-serial-fail", "SSW", onFirstFailErr);
    await failFirstStagedPromise;

    const secondFailPromise = transferConsultRoom("c-serial-fail", "Urgent", onSecondFailErr);
    await Promise.resolve();
    expect(failTxCount).toBe(1);

    releaseFailFirstCommit();
    const secondFailCase = await secondFailPromise;
    await Promise.all([firstFailCase.backgroundPromise, secondFailCase.backgroundPromise]);

    expect(committedFailWrites).toHaveLength(1);
    expect(committedFailWrites[0].room).toBe("SSW");
    expect(committedFailWrites[0]["departments.Gen Sx.transfers"]).toEqual(
      expect.objectContaining({ elements: [expect.objectContaining({ to: "SSW" })] })
    );
    expect(onFirstFailErr).not.toHaveBeenCalled();
    expect(onSecondFailErr).toHaveBeenCalledTimes(1);
  });

  it("transferConsultRoom retains and retries offline transfer after a retryable connection failure", async () => {
    setNavigatorOnLine(false);
    mockGetDocFromCache.mockResolvedValueOnce(
      makeDocSnapshot(
        "c-retry",
        baseConsult({
          room: "NT",
          departments: { "Gen Sx": { status: "pending", completedAt: null } },
        })
      )
    );

    const updateSpy = vi.fn();
    let attempt = 0;
    mockRunTransaction.mockImplementation(async (_db, fn) => {
      attempt += 1;
      if (attempt === 1) {
        const err = new Error("Connection lost");
        (err as { code?: string }).code = "unavailable";
        throw err;
      }
      return fn({
        get: vi.fn().mockResolvedValue(makeDocSnapshot("c-retry", baseConsult({ room: "NT" }))),
        update: updateSpy,
      });
    });

    const onBackgroundError = vi.fn();
    const res = await transferConsultRoom("c-retry", "SSW", onBackgroundError);
    setNavigatorOnLine(true);
    window.dispatchEvent(new Event("online"));
    await res.backgroundPromise;

    expect(attempt).toBe(2);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(onBackgroundError).not.toHaveBeenCalled();
  });

  it("clearRetainedSubmitDraft cleans up legacy er_consult_submit_drafts_v1 sessionStorage key", () => {
    window.sessionStorage.setItem("er_consult_submit_drafts_v1", '{"hn":"999999"}');
    clearRetainedSubmitDraft();
    expect(window.sessionStorage.getItem("er_consult_submit_drafts_v1")).toBeNull();
  });
});