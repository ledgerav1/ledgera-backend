/**
 * Fixed: Proper calculation of weekly cash and profit targets
 */
export function calculateWeeklyTargets(
    payroll: number,
    fixedCosts: number,
    bankBalance: number,
    marginFloor = 0.3
): { requiredCash: number; requiredProfit: number } {
    // Required cash = what's needed beyond current bank balance
    const requiredCash = Math.max(0, payroll + fixedCosts - bankBalance);

    // Required profit = minimum profit needed based on margin floor
    // profit >= requiredCash * marginFloor
    const requiredProfit = requiredCash * marginFloor;

    return { requiredCash, requiredProfit };
}

export function getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

export function formatMoney(amount: number): string {
    return `$${amount.toFixed(2)}`;
}
