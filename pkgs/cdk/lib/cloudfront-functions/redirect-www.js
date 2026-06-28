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

  return request;
}
