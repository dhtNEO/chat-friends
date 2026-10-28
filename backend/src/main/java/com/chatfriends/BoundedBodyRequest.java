package com.chatfriends;

import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

final class BoundedBodyRequest extends HttpServletRequestWrapper {
  private final byte[] body;
  private final ServletInputStream stream;

  BoundedBodyRequest(HttpServletRequest source, byte[] body) {
    super(source);
    this.body = body;
    var bytes = new ByteArrayInputStream(body);
    stream =
        new ServletInputStream() {
          public int read() {
            return bytes.read();
          }

          public int read(byte[] b, int off, int len) {
            return bytes.read(b, off, len);
          }

          public boolean isFinished() {
            return bytes.available() == 0;
          }

          public boolean isReady() {
            return true;
          }

          public void setReadListener(ReadListener listener) {
            throw new UnsupportedOperationException("Synchronous API");
          }
        };
  }

  @Override
  public ServletInputStream getInputStream() {
    return stream;
  }

  @Override
  public BufferedReader getReader() {
    return new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8));
  }

  @Override
  public int getContentLength() {
    return body.length;
  }

  @Override
  public long getContentLengthLong() {
    return body.length;
  }
}
