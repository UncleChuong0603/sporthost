import { playerOpenSessions } from "@/server/modules/member-portal/registration";
import { memberRegister } from "@/app/(member)/me/actions";
import { ActionForm } from "@/features/shared/action-form";
import { moneyText } from "@/domain/catalog";
import { panel } from "./shared";
import { SessionDetails } from "@/features/bookings/session-details";

export async function OpenSessions({ accountId, csrf }: { accountId: number; csrf: string }) {
  const games = await playerOpenSessions(accountId);
  return <section className="mt-8" aria-label="Buổi đang mở đăng ký"><h2 className="text-xl font-bold">Đăng ký buổi chơi trong CLB</h2><p className="mb-5 mt-2 text-sm text-muted-foreground">Dùng hồ sơ đã được host liên kết. Hết chỗ sẽ vào danh sách chờ.</p>{!games.length && <p className={panel + " text-sm text-muted-foreground"}>Chưa có buổi mở đăng ký mới trong các CLB đã liên kết.</p>}<div className="grid gap-4 sm:grid-cols-2">{games.map(game => <article key={`${game.id}-${game.memberId}`} className={panel}><p className="text-xs font-semibold text-primary">{game.clubName}</p><h3 className="mt-2 text-xl font-bold">{game.title}</h3><p className="mt-2 text-sm text-muted-foreground">{game.memberName}</p><p className="mt-3 text-sm">{game.startsAt.replace("T", " · ")}</p><p className="mt-2 text-sm text-muted-foreground">{game.venue || "Liên hệ host để biết địa điểm"} · {game.confirmed}/{game.capacity} chỗ</p><p className="mt-3 font-semibold">{game.fee === null ? "Chia chi phí sau buổi chơi" : moneyText(game.fee)}</p><p className="mt-2 text-sm text-muted-foreground">{game.approval}</p><SessionDetails game={game} /><ActionForm className="mt-4" action={memberRegister.bind(null, game.id, game.memberId)} csrf={csrf} label="Đăng ký bằng hồ sơ của tôi" variant="default" /></article>)}</div></section>;
}
