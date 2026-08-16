import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface ConfirmOptions {
  /** The decision, as a question. One line - the detail belongs in `description`. */
  title: string;
  /** What actually happens if they go ahead, especially the part they cannot undo. */
  description?: ReactNode;
  /** Says what the button does, not "OK". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Colours the action as destructive and keeps focus on Cancel. */
  destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Ask before doing something the user cannot take back.
 *
 * Deliberately promise-shaped, so a call site reads the way `window.confirm` did:
 *
 *   if (await confirm({ title: "Remove proke from acme?" })) { ... }
 *
 * That is the whole reason this is imperative rather than a `<ConfirmDialog open={...} />` a
 * caller has to wire up with two pieces of state. Replacing a native confirm should be a
 * one-line change wherever the next one turns up, or it will not happen.
 */
export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);

  if (!confirm) {
    throw new Error("useConfirm must be used inside a <ConfirmProvider>");
  }

  return confirm;
}

interface PendingConfirm {
  options: ConfirmOptions;
  resolve: (confirmed: boolean) => void;
}

/**
 * Mounted once at the root, so any component can ask without rendering a dialog of its own.
 *
 * One dialog at a time by construction: a second request while one is open would leave the
 * first promise unresolved forever, so it resolves to false first.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [open, setOpen] = useState(false);
  const pendingRef = useRef<PendingConfirm | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const titleId = useId();
  const descriptionId = useId();

  const settle = useCallback((confirmed: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;

    setOpen(false);
    // `pending` outlives `open` on purpose: the content has to stay mounted while the exit
    // animation plays, or the dialog empties out and then fades.
    current?.resolve(confirmed);
  }, []);

  const confirm = useCallback<ConfirmFn>(
    (options) => {
      pendingRef.current?.resolve(false);

      return new Promise<boolean>((resolve) => {
        const next = { options, resolve };
        pendingRef.current = next;
        setPending(next);
        setOpen(true);
      });
    },
    []
  );

  const options = pending?.options;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      {options ? (
        <Modal
          open={open}
          onClose={() => settle(false)}
          labelledBy={titleId}
          describedBy={options.description ? descriptionId : undefined}
          // The safe way out gets the focus when the other one cannot be undone, so a reflexive
          // Enter closes the dialog rather than firing the thing it just warned about.
          initialFocusRef={options.destructive ? cancelRef : confirmRef}
        >
          <h2 id={titleId} className="text-sm font-medium text-balance">
            {options.title}
          </h2>

          {options.description ? (
            <div
              id={descriptionId}
              className="mt-2 text-xs leading-relaxed text-muted-foreground"
            >
              {options.description}
            </div>
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            <Button
              ref={cancelRef}
              variant="ghost"
              size="sm"
              onClick={() => settle(false)}
            >
              {options.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              ref={confirmRef}
              variant={options.destructive ? "destructive" : "default"}
              size="sm"
              onClick={() => settle(true)}
            >
              {options.confirmLabel ?? "Confirm"}
            </Button>
          </div>
        </Modal>
      ) : null}
    </ConfirmContext.Provider>
  );
}
