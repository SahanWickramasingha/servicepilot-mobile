import { MessageSquareText, Search, Star } from "lucide-react";
import { useMemo, useState } from "react";

import { DataState } from "../components/DataState";
import { useCollectionData } from "../hooks/useCollectionData";
import type { ServiceReviewRecord, UserRecord } from "../types";
import { displayText, formatDateTime } from "../utils/format";

export default function Reviews() {
  const reviews = useCollectionData<ServiceReviewRecord>("service_reviews");
  const users = useCollectionData<UserRecord>("users");
  const [search, setSearch] = useState("");

  const userName = (uid?: string) =>
    users.data.find((user) => (user.uid ?? user.id) === uid)?.fullName ?? uid;

  const filteredReviews = useMemo(
    () =>
      reviews.data.filter((review) =>
        [
          review.requestId,
          review.comment,
          userName(review.customerId),
          userName(review.technicianId),
        ]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase())
      ),
    [reviews.data, search, users.data]
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Reviews</h1>
          <p>View customer reviews and technician ratings.</p>
        </div>
      </div>

      <div className="table-toolbar">
        <div className="table-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search reviews..."
          />
        </div>
      </div>

      <section className="dashboard-card">
        <DataState
          loading={reviews.loading || users.loading}
          error={reviews.error || users.error}
          empty={filteredReviews.length === 0}
        >
          <div className="table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Customer</th>
                  <th>Technician</th>
                  <th>Rating</th>
                  <th>Comment</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {filteredReviews.map((review) => (
                  <tr key={review.id}>
                    <td>{displayText(review.requestId)}</td>
                    <td>{displayText(userName(review.customerId))}</td>
                    <td>{displayText(userName(review.technicianId))}</td>
                    <td>
                      <span className="rating-display">
                        <Star size={14} fill="#f59e0b" />
                        {review.rating ?? 0}
                      </span>
                    </td>
                    <td>{displayText(review.comment)}</td>
                    <td>{formatDateTime(review.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataState>
      </section>

      <div className="dashboard-card note-card">
        <MessageSquareText size={19} />
        <span>Reviews are read-only here. Moderation is not implemented.</span>
      </div>
    </>
  );
}
