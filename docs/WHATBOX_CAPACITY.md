# Whatbox HTTPS capacity: evidence and support draft

The public 100-listener acceptance target remains unverified. Do not mark it passed.

At 00:47 UTC on 7 October 2026, a ramp opened 100 public HTTPS MP3 streams from
Whatbox. All streams received data. The next public status request failed during
TLS negotiation with ConnectionResetError, errno 104. The local status API still
reported 100 listeners. The test stopped and closed its connections after 76 seconds;
it did not complete the 15-minute hold. Public status and catalogue requests passed
at 10, 25 and 50 streams. Evidence: `artifacts/load-20261007T004757.json`.

A separate short check held 100 streams and requested both public APIs from Whatbox
and the workstation. All four requests failed with connection reset. The 100 audio
streams continued until normal test cleanup. Evidence: `artifacts/capacity-origin-probe.json`.
This demonstrates a limit on the shared HTTPS path. It does not establish the exact
provider setting, its scope across other apps, or whether it is configurable.

The running Icecast configuration allows 160 clients, six sources and 120 listeners
per mount. The radio's Nginx has 1,024 worker connections. Its upstream is plain HTTP;
Whatbox terminates public TLS. Raising these application values is not an evidenced
fix for the observed TLS failure. No other application was load-tested.

## Draft for the user to relay

Hello,

I operate Pavoia Radio at https://pavoia.gaende.box.ca/ using a custom managed link
on port 14500. It serves continuous MP3 audio through my Nginx and Icecast.

On 7 October 2026 at approximately 00:49 UTC, 100 concurrent HTTPS audio streams
were receiving data. Any additional HTTPS request to the same hostname failed
during TLS negotiation with ConnectionResetError (errno 104). This happened both
from the seedbox and from my workstation. Existing audio continued, and the local
HTTP status API remained available. At 50 streams, public API requests succeeded.

Is there a concurrent-connection limit of 100 on the managed HTTPS entry point?
Is it per hostname, slot or client address? Can it support 100 continuous listeners
plus normal website and metadata requests? Please confirm the supported limit and
whether it can be raised for this app.

Thank you.

## Operational status

This message is a draft. It has not been sent to Whatbox. A temporary Nginx cap of
90 concurrent stream requests reserves capacity for page/API requests. This is a
mitigation, not completion of the 100-listener acceptance target. The managed entry
point must provide sufficient capacity before that target can be accepted.

The mitigation was deployed by Nginx reload at 00:54 UTC on 7 October.
Backup: `artifacts/capacity-guard-20261007T005431Z` on Whatbox. All container
start times stayed unchanged. A short acceptance check opened 90 streams across
six stations (15 each). The next stream received HTTP 503. Public status and
catalogue requests succeeded from Whatbox and the workstation; all 90 streams
continued until cleanup. Evidence: `artifacts/capacity-guard-probe.json`.
This was a short guard check, not a 15-minute capacity acceptance.
