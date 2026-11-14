import { SEED } from "@/lib/seed";

export const GET = () => Response.json({ pages: SEED });
