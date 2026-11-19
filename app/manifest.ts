import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ER Consult Dashboard MNRH",
    short_name: "ER Consult",
    description: "ระบบส่งปรึกษาผู้ป่วยฉุกเฉิน โรงพยาบาลมหาราชนครราชสีมา (MNRH)",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f7f3",
    theme_color: "#9a1d26",
    lang: "th",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
