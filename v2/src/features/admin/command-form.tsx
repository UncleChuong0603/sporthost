"use client";
import { useActionState, useRef, useState, useEffect } from "react";
import { executeAdmin } from "@/app/admin/actions";
export function CommandForm({
  targetId,
  version,
  csrf,
  user = false,
  suspended = false,
  self = false,
}: {
  targetId: number;
  version: string;
  csrf: string;
  user?: boolean;
  suspended?: boolean;
  self?: boolean;
}) {
  const [state, action, pending] = useActionState(executeAdmin, {});
  const dialog = useRef<HTMLDialogElement>(null),
    submit = useRef<HTMLButtonElement>(null),
    formRef = useRef<HTMLFormElement>(null),
    opener = useRef<HTMLButtonElement>(null);
  const [operation, setOperation] = useState(
    user ? (suspended ? "reactivate" : "suspend") : "extend_trial",
  );
  const [review, setReview] = useState({ reason: "", days: "", orderCode: "" });
  const [showToast, setShowToast] = useState(false);
  useEffect(() => {
    if (user) setOperation(suspended ? "reactivate" : "suspend");
  }, [user, suspended]);
  useEffect(() => {
    if (!state.success) return;
    setShowToast(true);
    const timer = setTimeout(() => setShowToast(false), 7000);
    return () => clearTimeout(timer);
  }, [state]);
  const close = () => {
    dialog.current?.close();
    opener.current?.focus();
  };
  if (self)
    return (
      <p className="rounded-lg border p-4 text-sm text-muted-foreground">
        Bạn đang xem tài khoản của mình. Không thể tự đình chỉ.
      </p>
    );
  return (
    <form
      ref={formRef}
      action={action}
      className="space-y-4 rounded-xl border bg-background p-5"
    >
      <h2 className="text-lg font-bold">Thao tác quản trị</h2>
      <input type="hidden" name="targetId" value={targetId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="confirmed" value="yes" />
      <label className="block text-sm font-semibold">
        Hành động
        <select
          name="action"
          value={operation}
          onChange={(event) => setOperation(event.target.value)}
          className="mt-2 min-h-11 w-full rounded-lg border bg-background px-3"
        >
          {user ? (
            <option value={suspended ? "reactivate" : "suspend"}>
              {suspended
                ? "Khôi phục tài khoản"
                : "Đình chỉ và thu hồi phiên đăng nhập"}
            </option>
          ) : (
            <>
              <option value="extend_trial">Gia hạn trial</option>
              <option value="extend_pro">Gia hạn Pro đã từng kích hoạt</option>
              <option value="expire">Kết thúc quyền Pro/trial</option>
              <option value="verify_payment">
                Xác minh payOS và kích hoạt Pro
              </option>
            </>
          )}
        </select>
      </label>
      {!user && ["extend_trial", "extend_pro"].includes(operation) && (
        <label className="block text-sm font-semibold">
          Số ngày gia hạn (bỏ qua khi kết thúc)
          <input
            name="days"
            type="number"
            min={1}
            max={365}
            defaultValue={30}
            className="mt-2 min-h-11 w-full rounded-lg border px-3"
          />
        </label>
      )}
      {operation === "verify_payment" && (
        <label className="block text-sm font-semibold">
          Mã đơn payOS của CLB
          <input
            name="orderCode"
            required
            inputMode="numeric"
            pattern="[0-9]+"
            maxLength={16}
            className="mt-2 min-h-11 w-full rounded-lg border px-3"
          />
          <span className="mt-2 block text-xs font-normal text-muted-foreground">
            Chỉ kích hoạt khi API payOS xác nhận đã nhận đủ tiền. Chọn mã từ
            lịch sử thanh toán bên dưới.
          </span>
        </label>
      )}
      <label className="block text-sm font-semibold">
        Lý do quản trị
        <textarea
          name="reason"
          required
          minLength={5}
          maxLength={500}
          rows={3}
          className="mt-2 w-full rounded-lg border p-3"
          placeholder="Nêu lý do, không nhập thông tin nhạy cảm."
        />
      </label>
      <button
        ref={opener}
        type="button"
        disabled={pending}
        onClick={() => {
          if (formRef.current?.reportValidity()) {
            const values = new FormData(formRef.current);
            setReview({
              reason: String(values.get("reason") || ""),
              days: String(values.get("days") || ""),
              orderCode: String(values.get("orderCode") || ""),
            });
            dialog.current?.showModal();
            submit.current?.focus();
          }
        }}
        className="min-h-11 rounded-lg bg-primary px-5 font-semibold text-white disabled:opacity-50"
      >
        {pending ? "Đang lưu…" : "Xem lại và xác nhận"}
      </button>
      <dialog
        ref={dialog}
        onCancel={close}
        aria-labelledby="admin-confirm-title"
        className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border bg-background p-6 text-foreground backdrop:bg-black/40"
      >
        <h3 id="admin-confirm-title" className="text-xl font-bold">
          Xác nhận thay đổi #{targetId}
        </h3>
        <p className="mt-3 text-sm font-semibold">
          {
            (
              {
                suspend: "Đình chỉ tài khoản",
                reactivate: "Khôi phục tài khoản",
                extend_trial: "Gia hạn trial",
                extend_pro: "Gia hạn Pro",
                expire: "Kết thúc quyền Pro/trial",
                verify_payment: "Xác minh payOS",
              } as Record<string, string>
            )[operation]
          }
        </p>
        {review.days && (
          <p className="mt-2 text-sm">Gia hạn thêm {review.days} ngày.</p>
        )}
        {review.orderCode && (
          <p className="mt-2 break-words text-sm">
            Đơn payOS #{review.orderCode}
          </p>
        )}
        <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-sm">
          Lý do: {review.reason}
        </p>
        <p className="my-4 text-sm text-muted-foreground">
          Thay đổi có hiệu lực ngay và được lưu trong nhật ký cùng lý do bạn đã
          nhập. Dữ liệu CLB và thanh toán được giữ lại.
        </p>
        <div className="flex gap-3">
          <button
            ref={submit}
            className="min-h-11 rounded-lg bg-primary px-5 font-semibold text-white"
            onClick={() => dialog.current?.close()}
          >
            Xác nhận lưu
          </button>
          <button
            type="button"
            onClick={close}
            className="min-h-11 rounded-lg border px-5"
          >
            Quay lại
          </button>
        </div>
      </dialog>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.success && showToast && (
        <p
          role="status"
          className="fixed right-4 bottom-5 z-50 max-w-[calc(100vw_-_2rem)] rounded-xl border bg-background p-4 text-sm text-primary shadow-lg"
        >
          {state.success}
        </p>
      )}
    </form>
  );
}
