FROM maven:3.9.11-eclipse-temurin-25 AS build
WORKDIR /src
COPY pom.xml .
RUN --mount=type=secret,id=maven_settings,target=/root/.m2/settings.xml --mount=type=secret,id=build_truststore \
    if [ -f /run/secrets/build_truststore ]; then export MAVEN_OPTS=-Djavax.net.ssl.trustStore=/run/secrets/build_truststore; fi; mvn -B -ntp dependency:go-offline
COPY src src
RUN --mount=type=secret,id=maven_settings,target=/root/.m2/settings.xml --mount=type=secret,id=build_truststore \
    if [ -f /run/secrets/build_truststore ]; then export MAVEN_OPTS=-Djavax.net.ssl.trustStore=/run/secrets/build_truststore; fi; mvn -B -ntp package -DskipTests
FROM eclipse-temurin:25.0.3_9-jre
WORKDIR /app
RUN groupadd --gid 10001 app && useradd --uid 10001 --gid app --no-create-home app
COPY --from=build /src/target/chat-friends-0.1.0.jar app.jar
COPY --chmod=0444 health.sh /app/health.sh
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["java","-XX:MaxRAMPercentage=70","-jar","/app/app.jar"]
