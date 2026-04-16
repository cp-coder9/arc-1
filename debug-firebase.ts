import * as admin from "firebase-admin";
console.log("admin keys:", Object.keys(admin));
console.log("admin.apps:", (admin as any).apps);
console.log("admin.default keys:", (admin as any).default ? Object.keys((admin as any).default) : "no default");
