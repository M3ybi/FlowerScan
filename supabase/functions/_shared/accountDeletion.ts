type RequestClient = { rpc(name: string): PromiseLike<{ data: unknown; error: unknown }> };

export const submitAccountDeletionReview = async (client: RequestClient) => {
  try {
    const { data, error } = await client.rpc("request_account_deletion");
    const row = Array.isArray(data) ? data[0] : null;
    if (error || !row || typeof row.request_id !== "string" || !["requested", "processing", "completed"].includes(row.request_status)) {
      return { status: 503, body: { message: "Deletion review could not be submitted. Please retry." } };
    }
    return { status: 202, body: {
      destructiveAction: false, requestId: row.request_id, status: row.request_status,
      message: row.request_status === "completed" ? "Your deletion review is marked completed. Contact support if you still need help."
        : row.request_status === "processing" ? "Your verified deletion request is under review."
        : "Your verified deletion request is saved for manual review. No account or household data was deleted automatically.",
    } };
  } catch {
    return { status: 503, body: { message: "Deletion review could not be submitted. Please retry." } };
  }
};
