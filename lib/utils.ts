export function formatDDMMM(val?: string | null): string {
    if (!val) return "—";
    try {
        const d = new Date(val);
        if (isNaN(d.getTime())) return String(val);
        const day = d.getDate();
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const month = months[d.getMonth()];
        return `${day}-${month}`;
    } catch {
        return String(val);
    }
}
