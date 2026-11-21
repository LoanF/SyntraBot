'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';

/** Confirmation des actions destructives : nomme l'élément et dit la conséquence (jamais de boîte native du navigateur). */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = 'Supprimer', pending, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description} className="sm:w-[28rem]">
        <div className="flex justify-end gap-2 px-5 py-4">
          <DialogClose asChild><Button variant="ghost">Annuler</Button></DialogClose>
          <Button variant="danger" loading={pending} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
