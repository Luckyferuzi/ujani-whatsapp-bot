"use client";

import type { Msg } from "./types";

type ThreadStatusStripProps = {
  latestFailedOutbound: Msg | null;
  shouldShowHeaderFailure: boolean;
  describeFailure: (msg: Msg) => string;
  onDismissFailure: (id: string | number) => void;
};

export default function ThreadStatusStrip({
  latestFailedOutbound,
  shouldShowHeaderFailure,
  describeFailure,
  onDismissFailure,
}: ThreadStatusStripProps) {
  if (!shouldShowHeaderFailure || !latestFailedOutbound) return null;

  return (
    <div className="thread-failure-wrap">
      <div className="thread-lane">
        <div className="thread-failure-banner">
          <div className="thread-failure-banner-main">
            <div className="thread-failure-banner-title">Latest outbound message failed</div>
            <div className="thread-failure-banner-copy">{describeFailure(latestFailedOutbound)}</div>
          </div>
          <button
            type="button"
            className="thread-banner-close"
            onClick={() => onDismissFailure(latestFailedOutbound.id)}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
