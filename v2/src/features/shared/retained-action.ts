"use client";

import { useActionState, useRef } from "react";
import type { FormEvent } from "react";
import type { FormState } from "@/features/clubs/settings-form";

// React resets uncontrolled forms after a resolved action, including handled
// validation failures. Cancel only that reset; never persist sensitive values.
export function useRetainedAction(action: (state: FormState, form: FormData) => Promise<FormState>) {
  const failed = useRef(false);
  const [state, dispatch, pending] = useActionState(async (previous: FormState, form: FormData) => {
    try {
      const result = await action(previous, form);
      failed.current = !!result.error;
      return result;
    } catch (error) {
      if (error instanceof Error && "digest" in error) throw error;
      failed.current = true;
      return { error: "Kết nối bị gián đoạn. Kiểm tra trạng thái trước khi gửi lại thao tác." };
    }
  }, {});
  const onReset = (event: FormEvent<HTMLFormElement>) => { if (failed.current) event.preventDefault(); };
  return { state, dispatch, pending, onReset };
}
