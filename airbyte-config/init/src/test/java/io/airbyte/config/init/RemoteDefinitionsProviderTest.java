/*
 * Copyright (c) 2022 Airbyte, Inc., all rights reserved.
 */

package io.airbyte.config.init;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.fasterxml.jackson.databind.JsonNode;
import com.google.common.io.Resources;
import io.airbyte.commons.json.Jsons;
import io.airbyte.commons.util.MoreIterators;
import io.airbyte.config.StandardDestinationDefinition;
import io.airbyte.config.StandardSourceDefinition;
import io.airbyte.config.persistence.ConfigNotFoundException;
import java.io.IOException;
import java.net.URI;
import java.net.URL;
import java.net.http.HttpTimeoutException;
import java.nio.charset.Charset;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class RemoteDefinitionsProviderTest {

  private MockWebServer webServer;
  private static MockResponse validCatalogResponse;
  private static URI catalogUrl;
  private static JsonNode jsonCatalog;

  @BeforeEach
  void setup() throws IOException {
    webServer = new MockWebServer();
    catalogUrl = URI.create(webServer.url("/connector_catalog.json").toString());

    final URL testCatalog = Resources.getResource("connector_catalog.json");
    final String jsonBody = Resources.toString(testCatalog, Charset.defaultCharset());
    jsonCatalog = Jsons.deserialize(jsonBody);
    validCatalogResponse = new MockResponse().setResponseCode(200)
        .addHeader("Content-Type", "application/json; charset=utf-8")
        .addHeader("Cache-Control", "no-cache")
        .setBody(jsonBody);
  }

  @Test
  @SuppressWarnings({"PMD.AvoidDuplicateLiterals"})
  void testGetSourceDefinition() throws Exception {
    webServer.enqueue(validCatalogResponse);
    final RemoteDefinitionsProvider remoteDefinitionsProvider = new RemoteDefinitionsProvider(catalogUrl);
    final UUID stripeSourceId = UUID.fromString("e094cb9a-26de-4645-8761-65c0c425d1de");
    final StandardSourceDefinition stripeSource = remoteDefinitionsProvider.getSourceDefinition(stripeSourceId);
    assertEquals(stripeSourceId, stripeSource.getSourceDefinitionId());
    assertEquals("Stripe", stripeSource.getName());
    assertEquals("airbyte/source-stripe", stripeSource.getDockerRepository());
    assertEquals("https://docs.airbyte.io/integrations/sources/stripe", stripeSource.getDocumentationUrl());
    assertEquals("stripe.svg", stripeSource.getIcon());
    assertEquals(URI.create("https://docs.airbyte.io/integrations/sources/stripe"), stripeSource.getSpec().getDocumentationUrl());
  }

  @Test
  @SuppressWarnings({"PMD.AvoidDuplicateLiterals"})
  void testGetDestinationDefinition() throws Exception {
    webServer.enqueue(validCatalogResponse);
    final RemoteDefinitionsProvider remoteDefinitionsProvider = new RemoteDefinitionsProvider(catalogUrl);
    final UUID s3DestinationId = UUID.fromString("4816b78f-1489-44c1-9060-4b19d5fa9362");
    final StandardDestinationDefinition s3Destination = remoteDefinitionsProvider
        .getDestinationDefinition(s3DestinationId);
    assertEquals(s3DestinationId, s3Destination.getDestinationDefinitionId());
    assertEquals("S3", s3Destination.getName());
    assertEquals("airbyte/destination-s3", s3Destination.getDockerRepository());
    assertEquals("https://docs.airbyte.io/integrations/destinations/s3", s3Destination.getDocumentationUrl());
    assertEquals(URI.create("https://docs.airbyte.io/integrations/destinations/s3"), s3Destination.getSpec().getDocumentationUrl());
  }

  @Test
  void testGetInvalidDefinitionId() throws Exception {
    webServer.enqueue(validCatalogResponse);
    final RemoteDefinitionsProvider remoteDefinitionsProvider = new RemoteDefinitionsProvider(catalogUrl, Duration.ofSeconds(1));
    final UUID invalidDefinitionId = UUID.fromString("1a7c360c-1289-4b96-a171-2ac1c86fb7ca");

    assertThrows(
        ConfigNotFoundException.class,
        () -> remoteDefinitionsProvider.getSourceDefinition(invalidDefinitionId));
    assertThrows(
        ConfigNotFoundException.class,
        () -> remoteDefinitionsProvider.getDestinationDefinition(invalidDefinitionId));
  }

  @Test
  void testGetSourceDefinitions() throws Exception {
    webServer.enqueue(validCatalogResponse);
    final RemoteDefinitionsProvider remoteDefinitionsProvider = new RemoteDefinitionsProvider(catalogUrl);
    final List<StandardSourceDefinition> sourceDefinitions = remoteDefinitionsProvider.getSourceDefinitions();
    final int expectedNumberOfSources = MoreIterators.toList(jsonCatalog.get("sources").elements()).size();
    assertEquals(expectedNumberOfSources, sourceDefinitions.size());
  }

  @Test
  void testGetDestinationDefinitions() throws Exception {
    webServer.enqueue(validCatalogResponse);
    final RemoteDefinitionsProvider remoteDefinitionsProvider = new RemoteDefinitionsProvider(catalogUrl);
    final List<StandardDestinationDefinition> destinationDefinitions = remoteDefinitionsProvider.getDestinationDefinitions();
    final int expectedNumberOfDestinations = MoreIterators.toList(jsonCatalog.get("destinations").elements()).size();
    assertEquals(expectedNumberOfDestinations, destinationDefinitions.size());
  }

  @Test
  void testBadResponseStatus() {
    webServer.enqueue(new MockResponse().setResponseCode(404));
    assertThrows(IOException.class, () -> {
      new RemoteDefinitionsProvider(catalogUrl, Duration.ofSeconds(1));
    });
  }

  @Test
  void testTimeOut() {
    // No request enqueued -> Timeout
    assertThrows(HttpTimeoutException.class, () -> {
      new RemoteDefinitionsProvider(catalogUrl, Duration.ofSeconds(1));
    });
  }

  @Test
  void testNonJson() {
    final MockResponse notJson = new MockResponse().setResponseCode(200)
        .addHeader("Content-Type", "application/json; charset=utf-8")
        .addHeader("Cache-Control", "no-cache")
        .setBody("not json");
    webServer.enqueue(notJson);
    assertThrows(RuntimeException.class, () -> {
      new RemoteDefinitionsProvider(catalogUrl, Duration.ofSeconds(1));
    });
  }

}
