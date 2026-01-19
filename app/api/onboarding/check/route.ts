import { NextResponse } from "next/server";
import { sql } from "@/lib/sql";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get user's business
    const businessResult = await sql`
      SELECT bu.business_id
      FROM business_users bu
      WHERE bu.user_id = ${session.user.id}
      LIMIT 1
    `;

    if (businessResult.rows.length === 0) {
      return NextResponse.json({
        hasCompanyData: false,
        companyName: session.user.name || "",
        eik: "",
        napStoreNumber: "",
      });
    }

    const businessId = businessResult.rows[0].business_id;

    // Get business profile
    const profileResult = await sql`
      SELECT store_name, legal_name, bulstat, store_id
      FROM business_profiles
      WHERE business_id = ${businessId}
    `;

    if (profileResult.rows.length === 0) {
      return NextResponse.json({
        hasCompanyData: false,
        companyName: session.user.name || "",
        eik: "",
        napStoreNumber: "",
      });
    }

    const profile = profileResult.rows[0];

    // Check if all required fields are filled
    const hasCompanyData = Boolean(
      profile.bulstat &&
      profile.store_id &&
      (profile.store_name || profile.legal_name)
    );

    return NextResponse.json({
      hasCompanyData,
      companyName: profile.store_name || profile.legal_name || "",
      eik: profile.bulstat || "",
      napStoreNumber: profile.store_id || "",
    });
  } catch (error) {
    console.error("Error checking onboarding status:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
