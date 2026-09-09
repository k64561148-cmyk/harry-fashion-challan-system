import express, { Request, Response } from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory unified store cache
let storeVersion = 1;
let store: Record<string, any> = {
  masters: [],
  materials: [],
  master_rate_overrides: [],
  challans: [],
  challan_items: [],
  inward_entries: [],
  invoices: [],
  invoice_challans: [],
  rate_history: [],
  stock_corrections: [],
  master_advances: [],
  master_advance_ledger: [],
  audit_logs: [],
  ledger_transactions: [],
  company_settings: [],
  profiles: []
};

// Load initial store from file if available
try {
  if (fs.existsSync(STORE_PATH)) {
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      store = { ...store, ...parsed };
      console.log("[Server Store] Loaded persistent data store successfully.");
    }
  }
} catch (e) {
  console.warn("[Server Store] Note initializing store:", e);
}

// Save store atomically
function persistStore() {
  try {
    const tmpPath = `${STORE_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(store), "utf-8");
    fs.renameSync(tmpPath, STORE_PATH);
  } catch (err) {
    console.error("[Server Store] Failed to persist store:", err);
  }
}

// Connected SSE clients for live multi-device synchronization
const sseClients: Set<Response> = new Set();

function broadcastSync(sourceDeviceId?: string) {
  storeVersion++;
  const msg = JSON.stringify({
    version: storeVersion,
    timestamp: Date.now(),
    sourceDeviceId: sourceDeviceId || "server"
  });
  sseClients.forEach((client) => {
    try {
      client.write(`event: sync\ndata: ${msg}\n\n`);
    } catch (_) {
      sseClients.delete(client);
    }
  });
}

// Helper to extract unique key for collection documents
function getDocKey(collName: string, item: any): string {
  if (!item) return "";
  if (collName === "invoice_challans") {
    return `${item.invoice_id}_${item.challan_id}`;
  }
  return item.id || item.uid || item._id || "";
}

// API Routes
app.get("/api/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    version: storeVersion,
    connectedDevices: sseClients.size,
    totalChallans: store.challans?.length || 0,
    totalInvoices: store.invoices?.length || 0,
    totalMasters: store.masters?.length || 0,
    totalMaterials: store.materials?.length || 0
  });
});

// SSE endpoint for instant multi-device live synchronization
app.get("/api/sync/events", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  sseClients.add(res);

  // Send initial connected message
  res.write(`event: connected\ndata: ${JSON.stringify({ version: storeVersion, timestamp: Date.now() })}\n\n`);

  // Heartbeat interval to prevent intermediate reverse-proxy timeouts
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch (_) {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 20000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// GET /api/sync: Return current canonical data store
app.get("/api/sync", (req: Request, res: Response) => {
  res.json({
    success: true,
    version: storeVersion,
    timestamp: Date.now(),
    data: store
  });
});

// POST /api/sync/delete: Delete entities and record tombstones permanently
app.post("/api/sync/delete", (req: Request, res: Response) => {
  try {
    const { entity, id, ids, deviceId } = req.body || {};
    const idsToDelete: string[] = Array.isArray(ids) ? ids : (id ? [String(id)] : []);
    if (!entity || idsToDelete.length === 0) {
      return res.status(400).json({ success: false, message: "entity and id(s) required." });
    }

    if (!store.tombstones) store.tombstones = {};
    if (!Array.isArray(store.tombstones[entity])) store.tombstones[entity] = [];

    const idSet = new Set(idsToDelete);
    idsToDelete.forEach(idVal => {
      if (!store.tombstones[entity].includes(idVal)) {
        store.tombstones[entity].push(idVal);
      }
    });

    // Remove from main store
    if (Array.isArray(store[entity])) {
      store[entity] = store[entity].filter((item: any) => !idSet.has(getDocKey(entity, item)));
    }
    // Also remove items if entity is challans
    if (entity === 'challans' && Array.isArray(store.challan_items)) {
      store.challan_items = store.challan_items.filter((item: any) => !idSet.has(item.challan_id));
    }

    persistStore();
    broadcastSync(deviceId);

    res.json({
      success: true,
      entity,
      deletedCount: idsToDelete.length,
      version: storeVersion
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || "Failed to process delete." });
  }
});

// POST /api/sync: Merge client data into server store
app.post("/api/sync", (req: Request, res: Response) => {
  try {
    const { data: incomingData, deviceId, deletedIds } = req.body || {};
    if (!incomingData || typeof incomingData !== "object") {
      return res.status(400).json({ success: false, message: "Invalid payload: 'data' object required." });
    }

    let hasChanges = false;
    if (!store.tombstones) store.tombstones = {};

    // Process explicit deletedIds if supplied
    if (deletedIds && typeof deletedIds === "object") {
      Object.keys(deletedIds).forEach((collName) => {
        const idList: string[] = deletedIds[collName];
        if (Array.isArray(idList) && idList.length > 0) {
          if (!Array.isArray(store.tombstones[collName])) store.tombstones[collName] = [];
          const idSet = new Set(idList);
          idList.forEach(idVal => {
            if (!store.tombstones[collName].includes(idVal)) {
              store.tombstones[collName].push(idVal);
            }
          });
          if (Array.isArray(store[collName])) {
            const beforeCount = store[collName].length;
            store[collName] = store[collName].filter((item: any) => !idSet.has(getDocKey(collName, item)));
            if (store[collName].length !== beforeCount) hasChanges = true;
          }
        }
      });
    }

    // Merge each collection
    Object.keys(incomingData).forEach((collName) => {
      const incomingList = incomingData[collName];
      if (!Array.isArray(incomingList)) return;

      const currentList = store[collName] || [];
      const map = new Map<string, any>();
      const tombstoneSet = new Set(Array.isArray(store.tombstones[collName]) ? store.tombstones[collName] : []);

      currentList.forEach((item: any) => {
        const k = getDocKey(collName, item);
        if (k && !tombstoneSet.has(k)) map.set(k, item);
      });

      incomingList.forEach((item: any) => {
        const k = getDocKey(collName, item);
        if (!k) return;
        // Never resurrect a tombstoned record!
        if (tombstoneSet.has(k)) return;

        if (!map.has(k)) {
          map.set(k, item);
          hasChanges = true;
        } else {
          const existing = map.get(k);
          // For challans: preserve embedded items if incoming has items and existing does not
          if (collName === "challans" && Array.isArray(item.items) && item.items.length > 0 && (!existing.items || existing.items.length === 0)) {
            map.set(k, { ...existing, ...item });
            hasChanges = true;
          } else {
            // Check if incoming has timestamp update
            const incomingTs = new Date(item.updated_at || item.updatedAt || item.created_at || item.createdAt || 0).getTime();
            const existingTs = new Date(existing.updated_at || existing.updatedAt || existing.created_at || existing.createdAt || 0).getTime();
            if (incomingTs > existingTs) {
              map.set(k, { ...existing, ...item });
              hasChanges = true;
            }
          }
        }
      });

      store[collName] = Array.from(map.values());
    });

    if (hasChanges) {
      persistStore();
      broadcastSync(deviceId);
    }

    res.json({
      success: true,
      version: storeVersion,
      timestamp: Date.now(),
      data: store
    });
  } catch (err: any) {
    console.error("[POST /api/sync] Error:", err);
    res.status(500).json({ success: false, message: err?.message || String(err) });
  }
});

// POST /api/sync/push: Push single or batch records for a specific collection
app.post("/api/sync/push", (req: Request, res: Response) => {
  try {
    const { collection: collName, records, deviceId } = req.body || {};
    if (!collName || !Array.isArray(records)) {
      return res.status(400).json({ success: false, message: "Missing collection or records array" });
    }
    const currentList = store[collName] || [];
    const map = new Map<string, any>();
    currentList.forEach((item: any) => {
      const k = getDocKey(collName, item);
      if (k) map.set(k, item);
    });
    let addedOrUpdated = 0;
    records.forEach((item: any) => {
      const k = getDocKey(collName, item);
      if (!k) return;
      map.set(k, item);
      addedOrUpdated++;
    });
    store[collName] = Array.from(map.values());
    persistStore();
    broadcastSync(deviceId);
    res.json({ success: true, count: addedOrUpdated, version: storeVersion });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || String(err) });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Unified sync server running on http://localhost:${PORT}`);
  });
}

startServer();
