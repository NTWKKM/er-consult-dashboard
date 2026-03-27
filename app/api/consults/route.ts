import { NextRequest, NextResponse } from "next/server";
import { getConsultsByStatus, addConsult } from "@/lib/db";

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as "pending" | "completed" | null;

    if (!status || !["pending", "completed"].includes(status)) {
        return NextResponse.json(
            { error: "Query param 'status' must be 'pending' or 'completed'" },
            { status: 400 }
        );
    }

    const consults = await getConsultsByStatus(status);
    return NextResponse.json(consults);
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { hn, room, problem, isUrgent, departments } = body;

        if (!hn || !room || !problem || !departments) {
            return NextResponse.json(
                { error: "Missing required fields: hn, room, problem, departments" },
                { status: 400 }
            );
        }

        const newConsult = await addConsult({
            hn,
            room,
            problem,
            isUrgent: isUrgent || false,
            status: "pending",
            departments,
        });

        return NextResponse.json(newConsult, { status: 201 });
    } catch (error) {
        console.error("Error creating consult:", error);
        return NextResponse.json(
            { error: "Failed to create consult" },
            { status: 500 }
        );
    }
}
