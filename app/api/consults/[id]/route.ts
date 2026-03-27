import { NextRequest, NextResponse } from "next/server";
import { getConsultById, updateConsult } from "@/lib/db";

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();

        const existing = await getConsultById(id);
        if (!existing) {
            return NextResponse.json({ error: "Consult not found" }, { status: 404 });
        }

        const updated = await updateConsult(id, body);
        return NextResponse.json(updated);
    } catch (error) {
        console.error("Error updating consult:", error);
        return NextResponse.json(
            { error: "Failed to update consult" },
            { status: 500 }
        );
    }
}
