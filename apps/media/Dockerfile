FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build

WORKDIR /src/apps/media
COPY apps/media/ ./
RUN dotnet restore Media.slnx --locked-mode
RUN dotnet publish src/Media.Api/Media.Api.csproj --configuration Release --no-restore --output /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0
RUN apt-get update \
    && apt-get install --yes --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app/publish ./

EXPOSE 8080
ENTRYPOINT ["dotnet", "Media.Api.dll"]
