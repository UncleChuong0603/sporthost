import Link from "next/link";
export function ConnectionEntry() {
  return <section className="my-6 rounded-2xl border bg-white p-5"><h2 className="font-bold">Kết nối thêm CLB</h2><p className="mt-2 text-sm text-muted-foreground">Dùng lời mời từ chủ CLB để gửi yêu cầu và theo dõi kết quả duyệt ngay trong app.</p><Link href="/me/connect" className="mt-2 inline-flex min-h-11 items-center font-semibold text-primary">Kết nối CLB & xem yêu cầu</Link></section>;
}
export function OwnerConnectionEntry({ clubs }: { clubs: { id: number; name: string }[] }) {
  if (!clubs.length) return null;
  return <section className="mb-6 rounded-2xl border bg-white p-5"><h2 className="font-bold">Lời mời và yêu cầu kết nối người chơi</h2><div className="mt-2 flex flex-wrap gap-x-5">{clubs.map(club => <Link key={club.id} href={`/clubs/${club.id}/connections`} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary">Kết nối người chơi · {club.name}</Link>)}</div></section>;
}
