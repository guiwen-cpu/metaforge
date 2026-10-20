package dev.lcp.bff.auth;

import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** 本地密码策略。登录不校验历史密码强度，新建/重置/修改密码时统一校验。 */
@Component
public class PasswordPolicy {

  private final int minLength;
  private final int maxLength;
  private final boolean requireUppercase;
  private final boolean requireLowercase;
  private final boolean requireDigit;
  private final boolean requireSymbol;

  public PasswordPolicy(
      @Value("${lcp.auth.password.min-length:8}") int minLength,
      @Value("${lcp.auth.password.max-length:128}") int maxLength,
      @Value("${lcp.auth.password.require-uppercase:false}") boolean requireUppercase,
      @Value("${lcp.auth.password.require-lowercase:true}") boolean requireLowercase,
      @Value("${lcp.auth.password.require-digit:true}") boolean requireDigit,
      @Value("${lcp.auth.password.require-symbol:false}") boolean requireSymbol) {
    this.minLength = Math.max(1, minLength);
    this.maxLength = Math.max(this.minLength, maxLength);
    this.requireUppercase = requireUppercase;
    this.requireLowercase = requireLowercase;
    this.requireDigit = requireDigit;
    this.requireSymbol = requireSymbol;
  }

  public void validate(String password, String username, String displayName) {
    if (password == null || password.isEmpty()) {
      throw AuthException.badRequest("password_required", "密码不能为空");
    }
    List<String> issues = new ArrayList<>();
    if (password.length() < minLength) {
      issues.add("至少 " + minLength + " 位");
    }
    if (password.length() > maxLength) {
      issues.add("最多 " + maxLength + " 位");
    }
    boolean hasUpper = false;
    boolean hasLower = false;
    boolean hasDigit = false;
    boolean hasSymbol = false;
    boolean hasWhitespace = false;
    for (int index = 0; index < password.length(); index++) {
      char value = password.charAt(index);
      hasUpper |= Character.isUpperCase(value);
      hasLower |= Character.isLowerCase(value);
      hasDigit |= Character.isDigit(value);
      hasSymbol |= !Character.isLetterOrDigit(value) && !Character.isWhitespace(value);
      hasWhitespace |= Character.isWhitespace(value);
    }
    if (hasWhitespace) {
      issues.add("不能包含空白字符");
    }
    if (requireUppercase && !hasUpper) {
      issues.add("需包含大写字母");
    }
    if (requireLowercase && !hasLower) {
      issues.add("需包含小写字母");
    }
    if (requireDigit && !hasDigit) {
      issues.add("需包含数字");
    }
    if (requireSymbol && !hasSymbol) {
      issues.add("需包含符号");
    }
    if (sameOrContains(password, username)) {
      issues.add("不能与登录名相同或包含登录名");
    }
    if (sameOrContains(password, displayName)) {
      issues.add("不能与显示名相同或包含显示名");
    }
    if (!issues.isEmpty()) {
      throw AuthException.badRequest("password_policy_violation",
          "密码不符合要求：" + String.join("；", issues));
    }
  }

  public PolicyView view() {
    return new PolicyView(
        minLength, maxLength, requireUppercase, requireLowercase, requireDigit, requireSymbol);
  }

  private static boolean sameOrContains(String password, String identity) {
    if (identity == null || identity.isBlank()) {
      return false;
    }
    String normalizedPassword = password.toLowerCase();
    String normalizedIdentity = identity.trim().toLowerCase();
    return normalizedIdentity.length() >= 3 && normalizedPassword.contains(normalizedIdentity);
  }

  public record PolicyView(
      int minLength,
      int maxLength,
      boolean requireUppercase,
      boolean requireLowercase,
      boolean requireDigit,
      boolean requireSymbol) {
  }
}