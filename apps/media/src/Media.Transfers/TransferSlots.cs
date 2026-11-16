using Microsoft.Extensions.Options;

namespace Media.Transfers;

internal sealed class TransferSlots(IOptions<TransferOptions> options) : IDisposable
{
    private readonly SemaphoreSlim slots = new(options.Value.ConcurrentTransfers);

    public async Task<IDisposable?> TryAcquireAsync(CancellationToken cancellationToken) =>
        await slots.WaitAsync(0, cancellationToken) ? new Reservation(slots) : null;

    public void Dispose() => slots.Dispose();

    private sealed class Reservation(SemaphoreSlim slots) : IDisposable
    {
        public void Dispose() => slots.Release();
    }
}
