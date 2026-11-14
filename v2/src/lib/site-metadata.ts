export const siteTitle = "SportHost | Quản lý CLB, lịch chơi và thu chi";
export const siteDescription = "Lên lịch chơi, quản lý thành viên, điểm danh và theo dõi thu chi câu lạc bộ thể thao. Bớt việc quản lý, thêm giờ ra sân cùng SportHost.";
const image = { url: "/images/sporthost-share-v1.png", width: 1200, height: 630, type: "image/png", alt: "SportHost — Bớt việc quản lý, thêm giờ ra sân. Lịch chơi, thành viên và thu chi gọn trong một nơi." };
export const socialMetadata = {
  openGraph: { type: "website" as const, locale: "vi_VN", siteName: "SportHost", title: siteTitle, description: siteDescription, images: [image] },
  twitter: { card: "summary_large_image" as const, title: siteTitle, description: siteDescription, images: [image] },
};
