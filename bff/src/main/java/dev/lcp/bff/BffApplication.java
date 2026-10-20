package dev.lcp.bff;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import dev.lcp.bff.auth.sso.SsoProperties;

/** MetaForge BFF 启动类。同时扫描 bff 与 codegen 生成的控制面代码。 */
@SpringBootApplication(scanBasePackages = "dev.lcp")
@EnableConfigurationProperties(SsoProperties.class)
public class BffApplication {

  public static void main(String[] args) {
    SpringApplication.run(BffApplication.class, args);
  }
}
