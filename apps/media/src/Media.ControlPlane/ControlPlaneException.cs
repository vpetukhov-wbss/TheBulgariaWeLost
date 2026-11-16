using System.Net;

namespace Media.ControlPlane;

public sealed class ControlPlaneException(HttpStatusCode status) : Exception("Media control plane request failed.")
{
    public HttpStatusCode Status { get; } = status;
}
