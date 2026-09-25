import bcrypt from "bcryptjs";
import {db} from "./db.ts";

try {
    const passwordHash = await bcrypt.hash("DemoPass123!", 12);
    for (const [email, role] of [
        ["admin@example.com", "ADMIN"],
        ["user@example.com", "USER"],
    ] as const) {
        await db.user.upsert({
            where: {email},
            update: {},
            create: {email, role, passwordHash},
        });
    }
    console.log(
        "Demo accounts ready. New accounts use the development-only password DemoPass123!",
    );
} finally {
    await db.$disconnect();
}
