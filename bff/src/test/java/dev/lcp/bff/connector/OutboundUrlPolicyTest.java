package dev.lcp.bff.connector;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.URI;
import org.junit.jupiter.api.Test;

class OutboundUrlPolicyTest {

  private static OutboundUrlPolicy policy(boolean allowPrivate, boolean allowHttp) {
    ConnectorProperties properties = new ConnectorProperties();
    properties.getConnectors().setAllowPrivateNetworks(allowPrivate);
    properties.getConnectors().setAllowInsecureHttp(allowHttp);
    return new OutboundUrlPolicy(properties);
  }

  @Test
  void rejectsLoopbackWhenPrivateNetworksDisabled() {
    OutboundUrlPolicy policy = policy(false, true);
    assertThatThrownBy(() -> policy.resolve(URI.create("http://127.0.0.1:8080/health")))
        .isInstanceOf(OutboundUrlPolicy.PolicyViolation.class);
  }

  @Test
  void allowsLoopbackWhenPrivateNetworksEnabled() {
    OutboundUrlPolicy policy = policy(true, true);
    OutboundUrlPolicy.PinnedTarget target = policy.resolve(URI.create("http://127.0.0.1:8080/health"));
    assertThat(target.host()).isEqualTo("127.0.0.1");
    assertThat(target.port()).isEqualTo(8080);
    assertThat(target.address().isLoopbackAddress()).isTrue();
  }

  @Test
  void alwaysRejectsMetadataAddress() {
    OutboundUrlPolicy policy = policy(true, true);
    assertThatThrownBy(() -> policy.resolve(URI.create("http://169.254.169.254/latest/meta-data")))
        .isInstanceOf(OutboundUrlPolicy.PolicyViolation.class);
  }

  @Test
  void rejectsInsecureHttpByDefault() {
    OutboundUrlPolicy policy = policy(true, false);
    assertThatThrownBy(() -> policy.resolve(URI.create("http://127.0.0.1:8080")))
        .isInstanceOf(OutboundUrlPolicy.PolicyViolation.class);
  }
}
