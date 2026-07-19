"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function RemoveFromCollectionButton({
  collectionId,
  postId,
}: {
  collectionId: string;
  postId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const remove = async () => {
    if (!window.confirm("この投稿をコレクションから外しますか？")) return;
    setLoading(true);
    try {
      await fetch(`/api/collections/${collectionId}/posts`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="ghost" size="sm" onClick={remove} disabled={loading}>
      外す
    </Button>
  );
}
