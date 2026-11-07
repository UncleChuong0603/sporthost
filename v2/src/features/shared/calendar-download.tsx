export function CalendarDownload({ href }: { href: string }) {
  return <div className="my-5 space-y-2">
    <a href={href} className="inline-flex min-h-11 items-center rounded-lg border bg-white px-4 text-sm font-semibold text-primary">Lưu vào lịch cá nhân (.ics)</a>
    <p className="max-w-xl text-xs leading-5 text-muted-foreground">Mở file bằng ứng dụng lịch của bạn. Lịch đã lưu không tự cập nhật; kiểm tra SportHost trước khi đến sân.</p>
  </div>;
}
