package dev.lcp.bff.runtime;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * 附件文件存储抽象。当前实现为本地目录，后续切换 OSS 时保持同一对象键契约。
 *
 * <p>对象键由服务端生成，绝不直接拼接客户端文件名，避免路径穿越。
 */
@Service
public class AttachmentStorage {

  private final Path base;

  public AttachmentStorage(@Value("${lcp.attachments.dir:./data/attachments}") String dir) {
    this.base = Paths.get(dir).toAbsolutePath().normalize();
  }

  public Stored store(String objectKey, InputStream input) throws IOException {
    Path target = resolve(objectKey);
    Files.createDirectories(target.getParent());
    MessageDigest digest = digest();
    try (DigestInputStream stream = new DigestInputStream(input, digest)) {
      Files.copy(stream, target, StandardCopyOption.REPLACE_EXISTING);
    }
    return new Stored(target, HexFormat.of().formatHex(digest.digest()));
  }

  public Path resolve(String objectKey) {
    if (objectKey == null || objectKey.isBlank()) {
      throw new IllegalArgumentException("对象键不能为空");
    }
    Path target = base.resolve(objectKey).normalize();
    if (!target.startsWith(base)) {
      throw new IllegalArgumentException("非法对象键");
    }
    return target;
  }

  public void delete(String objectKey) throws IOException {
    Files.deleteIfExists(resolve(objectKey));
  }

  private static MessageDigest digest() {
    try {
      return MessageDigest.getInstance("SHA-256");
    } catch (NoSuchAlgorithmException ex) {
      throw new IllegalStateException("当前 JVM 不支持 SHA-256", ex);
    }
  }

  public record Stored(Path path, String checksum) {
  }
}