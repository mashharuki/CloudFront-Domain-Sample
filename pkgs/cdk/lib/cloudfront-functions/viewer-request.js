function handler(event) {
  const request = event.request;
  const host = request.headers.host ? request.headers.host.value : undefined;

  if (host === "www.mashharuki.com") {
    return {
      statusCode: 301,
      statusDescription: "Moved Permanently",
      headers: {
        location: { value: `https://mashharuki.com${request.uri}` },
      },
    };
  }

  const uri = request.uri;
  const isApiPath = uri === "/v1" || uri.indexOf("/v1/") === 0;
  const hasFileExtension = uri.split("/").pop().indexOf(".") !== -1;

  if (!isApiPath && !hasFileExtension) {
    request.uri = "/index.html";
  }

  return request;
}
