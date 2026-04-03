export function getTransactions() {
    if (typeof window === "undefined") return [];

    const data = localStorage.getItem("transactions");
    return data ? JSON.parse(data) : [];
}

export function saveTransaction(tx) {
    const existing = getTransactions();
    const updated = [tx, ...existing];

    localStorage.setItem("transactions", JSON.stringify(updated));
}

export function clearTransactions() {
    localStorage.removeItem("transactions");
}
export function deleteTransaction(id) {
    const existing = getTransactions();

    const updated = existing.filter((t) => String(t.id) !== String(id));

    localStorage.setItem("transactions", JSON.stringify(updated));
}
export function getTransactionById(id) {
    const existing = getTransactions();
    return existing.find((t) => String(t.id) === String(id));
}

export function updateTransaction(updatedTx) {
    const existing = getTransactions();

    const updated = existing.map((t) =>
        String(t.id) === String(updatedTx.id) ? updatedTx : t
    );

    localStorage.setItem("transactions", JSON.stringify(updated));
}

function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
}

function normalizeDate(value) {
    return String(value || "").trim();
}

function normalizeAmountValue(value) {
    return Number((Number(value) || 0).toFixed(2));
}

function createTransactionKey(item) {
    return [
        normalizeText(item.title),
        normalizeAmountValue(item.amount),
        normalizeDate(item.date),
        normalizeText(item.type),
        normalizeText(item.category),
    ].join("|");
}

export function saveManyTransactions(items) {
    const existing = getTransactions();

    const existingKeys = new Set(existing.map(createTransactionKey));

    const normalized = items.map((item, index) => ({
        id: Date.now() + index + Math.floor(Math.random() * 100000),
        title: item.title || "",
        amount: normalizeAmountValue(item.amount),
        date: item.date || "",
        type: item.type || "Expense",
        category: item.category || "Other",
        note: item.note || "",
        paid: item.paid || false,
        paidAt: item.paidAt || "",
    }));

    const uniqueToImport = normalized.filter((item) => {
        const key = createTransactionKey(item);

        if (existingKeys.has(key)) {
            return false;
        }

        existingKeys.add(key);
        return true;
    });

    localStorage.setItem(
        "transactions",
        JSON.stringify([...uniqueToImport, ...existing])
    );

    return {
        imported: uniqueToImport.length,
        skipped: normalized.length - uniqueToImport.length,
    };
}
export function markDebtAsPaid(id) {
    const existing = getTransactions();

    const updated = existing.map((t) =>
        String(t.id) === String(id)
            ? {
                ...t,
                paid: true,
                paidAt: new Date().toISOString().slice(0, 10),
            }
            : t
    );

    localStorage.setItem("transactions", JSON.stringify(updated));
}
export function markDebtAsOpen(id) {
    const existing = getTransactions();

    const updated = existing.map((t) =>
        String(t.id) === String(id)
            ? {
                ...t,
                paid: false,
                paidAt: "",
            }
            : t
    );

    localStorage.setItem("transactions", JSON.stringify(updated));
}